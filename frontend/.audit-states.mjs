import fs from 'node:fs';import path from 'node:path';import {chromium} from '@playwright/test';
function loadEnv(f){const o={};for(const l of fs.readFileSync(f,'utf8').split('\n')){const m=l.match(/^([A-Z0-9_]+)=(.*)$/);if(m)o[m[1]]=m[2].replace(/^["']|["']$/g,'');}return o;}
const env=loadEnv(path.resolve('../.env'));const b=await chromium.launch();const c=await b.newContext({viewport:{width:1440,height:1000},deviceScaleFactor:2,locale:'zh-CN'});const p=await c.newPage();
await p.goto('http://127.0.0.1:3000/admin/login',{waitUntil:'networkidle'});await p.fill('#username',env.TEST_USERNAME);await p.fill('#password',env.TEST_PASSWORD);await p.click('button[type=submit]');await p.waitForURL(u=>!u.pathname.startsWith('/admin/login'),{timeout:30000});
// error state
await p.route('**/admin/merchant/companies?*',r=>r.fulfill({status:500,contentType:'application/json',body:JSON.stringify({code:1,message:'服务器内部错误'})}));
await p.goto('http://127.0.0.1:3000/admin/merchant/companies',{waitUntil:'networkidle'});await p.waitForTimeout(500);await p.screenshot({path:'../tmp/unslop/companies-error.png',fullPage:true});
const err=await p.evaluate(()=>{const main=document.querySelector('main');const texts=[...main.querySelectorAll('p,td')].map(el=>({tag:el.tagName,text:el.textContent.trim(),rect:el.getBoundingClientRect().toJSON(),color:getComputedStyle(el).color,font:getComputedStyle(el).fontSize})).filter(x=>x.text.includes('错误')||x.text.includes('暂无')||x.text.includes('加载'));return texts;});
console.log('ERROR',JSON.stringify(err,null,2));
await p.unroute('**/admin/merchant/companies?*');
// loading state
await p.route('**/admin/merchant/companies?*',async r=>{await new Promise(x=>setTimeout(x,4000));await r.continue();});
await p.goto('http://127.0.0.1:3000/admin/merchant/companies',{waitUntil:'domcontentloaded'});await p.waitForTimeout(400);await p.screenshot({path:'../tmp/unslop/companies-loading.png',fullPage:true});
const load=await p.evaluate(()=>({text:[...document.querySelectorAll('tbody td')].map(x=>x.textContent.trim()),btn:[...document.querySelectorAll('main button')].filter(x=>x.textContent.includes('查询')).map(x=>({text:x.textContent.trim(),disabled:x.disabled,opacity:getComputedStyle(x).opacity}))}));console.log('LOADING',JSON.stringify(load,null,2));
await p.unroute('**/admin/merchant/companies?*');
// focus via tab
await p.goto('http://127.0.0.1:3000/admin/merchant/companies',{waitUntil:'networkidle'});await p.waitForTimeout(400);
const focuses=[];for(let i=0;i<80;i++){await p.keyboard.press('Tab');const f=await p.evaluate(()=>{const el=document.activeElement;if(!el)return null;const s=getComputedStyle(el);const r=el.getBoundingClientRect();return {tag:el.tagName,text:(el.textContent||'').trim().replace(/\s+/g,' ').slice(0,30),aria:el.getAttribute('aria-label'),type:el.getAttribute('type'),x:Math.round(r.x),y:Math.round(r.y),outline:s.outline,boxShadow:s.boxShadow,borderColor:s.borderColor};});if(f)focuses.push(f);}
const pageFocus=focuses.filter(f=>f.y>100&&f.y<950);console.log('FOCUS_FIRST',JSON.stringify(focuses.slice(0,8),null,2));console.log('FOCUS_PAGE',JSON.stringify(pageFocus.slice(0,15),null,2));
// mobile delete dialog
await p.setViewportSize({width:390,height:844});await p.goto('http://127.0.0.1:3000/admin/merchant/companies',{waitUntil:'networkidle'});await p.waitForTimeout(400);
// table is clipped; use JS click first delete button
await p.evaluate(()=>{const btns=[...document.querySelectorAll('tbody button')];const del=btns.find(b=>b.textContent.includes('删除'));del?.click();});await p.waitForTimeout(400);await p.screenshot({path:'../tmp/unslop/companies-delete-mobile.png',fullPage:false});
const dlg=await p.evaluate(()=>{const d=document.querySelector('[data-slot=dialog-content]');if(!d)return null;const r=d.getBoundingClientRect();const btns=[...d.querySelectorAll('button')].map(x=>{const b=x.getBoundingClientRect();return {text:x.textContent.trim(),x:Math.round(b.x),y:Math.round(b.y),w:Math.round(b.width),h:Math.round(b.height)}});return {rect:{x:r.x,y:r.y,w:r.width,h:r.height},btns};});console.log('DIALOG_MOBILE',JSON.stringify(dlg,null,2));
await b.close();
