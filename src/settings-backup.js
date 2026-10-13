/* Portable settings; galleries and database identity always belong to the destination. */
(function (W) {
'use strict';
const fields=['draw','inline','pairs','ui','activeApi','paramSets','skins'];
const record=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const clone=x=>JSON.parse(JSON.stringify(x));
function fail(){throw Error('设置文件格式不正确，未修改现有数据。');}
function list(a){if(!Array.isArray(a)||a.length>10000)fail();const ids=new Set();for(const x of a){if(!record(x)||typeof x.id!=='string'||!x.id||ids.has(x.id))fail();ids.add(x.id);}return a;}
function validate(b){
 if(!record(b)||b.format!=='pear-atelier-settings'||b.version!==1)throw Error('请选择梨梨画室导出的设置文件（版本 1）。');
 const p=b.settings;if(!record(p)||!record(p.draw)||!record(p.inline)||!record(p.ui))fail();
 for(const k of ['pairs','paramSets','skins'])list(p[k]);
 for(const x of p.pairs)if(typeof x.name!=='string'||typeof x.positive!=='string'||typeof x.negative!=='string')fail();
 for(const x of p.skins)if(typeof x.css!=='string'||typeof x.name!=='string')fail();
 for(const x of p.paramSets)if(!record(x.value)||typeof x.name!=='string')fail();
 for(const x of [p.draw,p.inline,...p.paramSets.map(x=>x.value)]){
  for(const k of ['width','height','steps','scale','rescale','seed','count','strength','noise'])if(x[k]!==undefined&&(typeof x[k]!=='number'||!Number.isFinite(x[k])))fail();
  if(typeof x.model!=='string')fail();
 }
 if(typeof p.draw.prompt!=='string'||typeof p.draw.negative!=='string'||!Array.isArray(p.draw.characters))fail();
 for(const x of p.draw.characters)if(!record(x))fail();
 if(p.ui.css!==null&&typeof p.ui.css!=='string')fail();
 for(const x of list(b.profiles)){
  if(x.kind!=='api'||!['official','third'].includes(x.type)||typeof x.name!=='string'||typeof x.url!=='string'||(x.key!==undefined&&typeof x.key!=='string'))fail();
  let u;try{u=new URL(x.url);}catch{fail();}
  if(u.username||u.password||u.search||u.hash||!(u.protocol==='https:'||(u.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(u.hostname))))fail();
  if(x.type==='official'&&x.url!=='https://image.novelai.net')fail();
 }
 if(p.activeApi!==null&&p.activeApi!==undefined&&!b.profiles.some(x=>x.id===p.activeApi))fail();
 if(b.vibes!==undefined){list(b.vibes);const ids=new Set(b.vibes.map(x=>x.id));for(const v of b.vibes){if(typeof v.name!=='string')fail();if(v.memberIds&&(!Array.isArray(v.memberIds)||v.memberIds.length>4||!v.memberIds.every(id=>ids.has(id))))fail();if(v.encodings!==undefined&&!Array.isArray(v.encodings))fail();}}
 if(b.assets!==undefined&&(!record(b.assets)||!Array.isArray(b.assets.precise)))fail();
 return b;
}
function parse(raw){if(raw.length>100*1024*1024)throw Error('文件超过 100 MB，请分开迁移素材。');let b;try{b=JSON.parse(raw,(k,v)=>{if(['__proto__','constructor','prototype'].includes(k))fail();return v;});}catch{fail();}return validate(b);}
function create(settings,profiles,options={}){
 const b={format:'pear-atelier-settings',version:1,appVersion:'1.1.0',createdAt:new Date().toISOString(),settings:Object.fromEntries(fields.map(k=>[k,clone(settings[k]??null)])),profiles:clone(profiles)};
 for(const p of b.profiles)if(!options.keys)delete p.key;
 if(options.vibes!==undefined)b.vibes=clone(options.vibes);
 if(options.assets!==undefined)b.assets=clone(options.assets);
 return validate(b);
}
function merge(b,current,existing){
 validate(b);const settings={...clone(current),...Object.fromEntries(fields.map(k=>[k,clone(b.settings[k]??null)]))};
 // A settings backup must not change album ownership or revive deleted pictures.
 const profiles=b.profiles.map(p=>{const old=existing.find(x=>x.id===p.id&&x.type===p.type&&x.url===p.url);return{...clone(p),key:p.key??old?.key??''};});
 if(b.vibes!==undefined)settings.deletedVibeGroups=[];
 return{settings,profiles};
}
W.PearSettingsBackup={create,parse,merge};
})(window);

