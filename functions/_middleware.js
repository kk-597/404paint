export async function onRequest(context) {
  const { request, next, env } = context;

  // 从环境变量读取密码
  const PASSWORD = env.CFP_PASSWORD;
  if (!PASSWORD) {
    return new Response("未设置 CFP_PASSWORD 环境变量", { status: 500 });
  }

  // 检查 Cookie 里是否已有正确密码
  const cookie = request.headers.get("Cookie") || "";
  const match = cookie.match(/auth=([^;]+)/);
  if (match && match[1] === PASSWORD) {
    return next();
  }

  // 处理登录表单提交
  if (request.method === "POST") {
    const formData = await request.formData();
    const input = formData.get("password");
    if (input === PASSWORD) {
      return new Response("登录成功", {
        status: 302,
        headers: {
          "Set-Cookie": `auth=${PASSWORD}; Path=/; HttpOnly; Secure; SameSite=Lax`,
          "Location": "/"
        }
      });
    }
    return new Response(loginPage("密码错误，请重试"), {
      status: 401,
      headers: { "Content-Type": "text/html; charset=utf-8" }
    });
  }

  // 未登录，显示登录页
  return new Response(loginPage(), {
    status: 401,
    headers: { "Content-Type": "text/html; charset=utf-8" }
  });
}

function loginPage(error = "") {
  return `<!DOCTYPE html>
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
    ${error ? `<div class="err">${error}</div>` : ""}
  </div>
</body>
</html>`;
}
