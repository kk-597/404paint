// build.js
// 用法：node build.js
// 作用：读取 src/ 下的源文件，生成根目录 _worker.js

const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, 'src');
const OUT = path.join(__dirname, '_worker.js');

const FILES = {
  'index.html':           'text/html; charset=utf-8',
  'app.js':               'application/javascript; charset=utf-8',
  'themes.js':            'application/javascript; charset=utf-8',
  'settings-backup.js':   'application/javascript; charset=utf-8',
  'native-bridge.js':     'application/javascript; charset=utf-8',
  'manifest.webmanifest': 'application/manifest+json',
};

const ASSETS = {};
for (const [name, type] of Object.entries(FILES)) {
  const full = path.join(SRC, name);
  if (!fs.existsSync(full)) {
    console.warn('跳过不存在的文件：' + name);
    continue;
  }
  const body = fs.readFileSync(full, 'utf8');
  ASSETS['/' + name] = { body, type };
}

const worker = `const ASSETS=${JSON.stringify(ASSETS)};

function loginPage(error = "") {
  return \`<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>请输入密码</title>
<style>
  body { font-family: sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: #f5f5f5; }
  .box { background: white; padding: 40px; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.1); text-align: center; }
  input { padding: 10px 14px; font-size: 16px; border: 1px solid #ccc; border-radius: 6px; width: 220px; }
  button { padding: 10px 20px; font-size: 16px; margin-left: 8px; border: none; border-radius: 6px; background: #333; color: white; cursor: pointer; }
  .err { color: #c00; margin-top: 12px; font-size: 14px; }
</style>
</head>
<body>
  <div class="box">
    <h2>🔒 请输入访问密码</h2>
    <form method="POST">
      <input type="password" name="password" placeholder="密码" autofocus>
      <button type="submit">进入</button>
    </form>
    \${error ? \`<div class="err">\${error}</div>\` : ""}
  </div>
</body>
</html>\`;
}

export default {
  async fetch(request, env) {
    const u = new URL(request.url);
    const PASSWORD = env.CFP_PASSWORD;

    if (!PASSWORD) return new Response("未设置 CFP_PASSWORD 环境变量", { status: 500 });

    const cookie = request.headers.get("Cookie") || "";
    const match = cookie.match(/auth=([^;]+)/);
    const loggedIn = match && match[1] === PASSWORD;

    if (!loggedIn) {
      if (request.method === "POST" && u.pathname === "/") {
        const formData = await request.formData();
        const input = formData.get("password");
        if (input === PASSWORD) {
          return new Response("登录成功", {
            status: 302,
            headers: {
              "Set-Cookie": \`auth=\${PASSWORD}; Path=/; HttpOnly; Secure; SameSite=Lax\`,
              "Location": "/"
            }
          });
        }
        return new Response(loginPage("密码错误，请重试"), {
          status: 401,
          headers: { "Content-Type": "text/html; charset=utf-8" }
        });
      }
      return new Response(loginPage(), {
        status: 401,
        headers: { "Content-Type": "text/html; charset=utf-8" }
      });
    }

    if (u.pathname.startsWith('/nai/')) {
      const route = u.pathname.slice(4);
      const expected = {
        '/ai/generate-image': 'POST',
        '/ai/encode-vibe': 'POST',
        '/ai/augment-image': 'POST',
        '/user/subscription': 'GET'
      }[route];
      if (!expected || request.method !== expected) return new Response('Not found', { status: 404 });

      const origin = request.headers.get('Origin');
      if (origin && origin !== u.origin) return new Response('Origin rejected', { status: 403 });

      const auth = request.headers.get('Authorization') || '';
      if (!auth.startsWith('Bearer ') || auth.length > 8192) return new Response('Key required', { status: 401 });
      if (Number(request.headers.get('Content-Length') || 0) > 41943040) return new Response('Request too large', { status: 413 });

      let body;
      if (expected === 'POST') {
        body = await request.arrayBuffer();
        if (body.byteLength > 41943040) return new Response('Request too large', { status: 413 });
      }

      try {
        // 【核心修复】查点数和查订阅走 api.novelai.net，生图和放大走 image.novelai.net
        const baseUrl = route === '/user/subscription' ? 'https://api.novelai.net' : 'https://image.novelai.net';
        const targetRoute = route === '/ai/upscale' ? '/ai/augment-image' : route;
        
        const response = await fetch(
          baseUrl + targetRoute,
          {
            method: expected,
            headers: {
              Authorization: auth,
              'Content-Type': 'application/json',
              'Accept': 'application/json',
              'User-Agent': 'Mozilla/5.0'
            },
            body,
            redirect: 'manual'
          }
        );
        if (response.status >= 300 && response.status < 400) return new Response('Upstream redirect rejected', { status: 502 });
        return new Response(response.body, {
          status: response.status,
          headers: {
            'Content-Type': response.headers.get('Content-Type') || 'application/octet-stream',
            'Cache-Control': 'no-store',
            'X-Content-Type-Options': 'nosniff'
          }
        });
      } catch {
        return new Response('NovelAI connection failed', { status: 502 });
      }
    }

    if (!['GET', 'HEAD'].includes(request.method)) return new Response('Method not allowed', { status: 405 });

    const path = u.pathname === '/' ? '/index.html' : u.pathname;
    const item = ASSETS[path];
    if (!item) return new Response('Not found', { status: 404 });

    return new Response(request.method === 'HEAD' ? null : item.body, {
      headers: {
        'Content-Type': item.type,
        'Cache-Control': 'no-cache',
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'no-referrer',
        'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; connect-src 'self' https: data: blob:; object-src 'none'; base-uri 'none'; frame-ancestors 'self'"
      }
    });
  }
};
`;

fs.writeFileSync(OUT, worker, 'utf8');
console.log('已生成 _worker.js，大小：' + fs.statSync(OUT).size + ' 字节');
