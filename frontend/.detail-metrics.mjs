import fs from 'node:fs';import path from 'node:path';import {chromium} from '@playwright/test';
function loadEnv(f){const o={};for(const l of fs.readFileSync(f,'utf8').split('\n')){const m=l.match(/^([A-Z0-9_]+)=(.*)$/);if(m)o[m[1]]=m[2].replace(/^["']|["']$/g,'');}return o;}
const env=loadEnv(path.resolve('../.env'));const b=await chromium.launch();const c=await b.newContext({viewport:{width:1440,height:1000},deviceScaleFactor:2,locale:'zh-CN'});const p=await c.newPage();
await p.goto('http://127.0.0.1:3000/admin/login',{waitUntil:'networkidle'});await p.fill('#username',env.TEST_USERNAME);await p.fill('#password',env.TEST_PASSWORD);await p.click('button[type=submit]');await p.waitForURL(u=>!u.pathname.startsWith('/admin/login'),{timeout:30000});await p.goto('http://127.0.0.1:3000/admin/merchant/companies',{waitUntil:'networkidle'});await p.waitForTimeout(700);
const d=await p.evaluate(()=>{
 const main=document.querySelector('main');
 const inPage=n=>main.contains(n);
 const all=[...main.querySelectorAll('*')];
 const textNodes=all.filter(n=>[...n.childNodes].some(c=>c.nodeType===3&&c.textContent.trim()));
 const small=textNodes.map(n=>({t:n.textContent.trim().slice(0,30),size:getComputedStyle(n).fontSize,weight:getComputedStyle(n).fontWeight,tag:n.tagName,cls:n.className?.toString().slice(0,80)})).filter(o=>parseFloat(o.size)<14);
 const ths=[...document.querySelectorAll('thead th')].map((t,i)=>({i,t:t.innerText,w:Math.round(t.getBoundingClientRect().width)}));
 const tds=[...document.querySelectorAll('tbody tr:first-child td')].map((t,i)=>({i,t:t.innerText.trim().slice(0,20),w:Math.round(t.getBoundingClientRect().width)}));
 const btns=[...main.querySelectorAll('button')].map(b=>({t:b.innerText.trim().slice(0,20),h:Math.round(b.getBoundingClientRect().height),r:getComputedStyle(b).borderRadius,bg:getComputedStyle(b).backgroundColor,color:getComputedStyle(b).color,font:getComputedStyle(b).fontSize+'/'+getComputedStyle(b).fontWeight})).filter(x=>x.h>0);
 const filled=btns.filter(x=>x.bg==='rgb(23, 25, 28)');
 const outline=btns.filter(x=>x.bg!=='rgb(23, 25, 28)').length;
 const pagination=document.querySelector('main .rounded-cards:last-of-type')?.parentElement?.innerText;
 return {small:small.slice(0,40),thCount:ths.length,ths,tds,totalButtons:btns.length,filled,outlineCount:outline};
});console.log(JSON.stringify(d,null,2));
// dialog title metrics
await p.locator('tbody tr').first().locator('button:has-text("删除")').evaluate(b=>b.click());await p.waitForTimeout(400);
const dia=await p.evaluate(()=>{const d=document.querySelector('[role=dialog]');const title=d.querySelector('[data-slot=dialog-title]');const desc=d.querySelector('[data-slot=dialog-description]');const cs=getComputedStyle(title);return {title:title.innerText,font:cs.fontFamily,size:cs.fontSize,weight:cs.fontWeight,lh:cs.lineHeight,letter:cs.letterSpacing,dialogRadius:getComputedStyle(d).borderRadius,descSize:getComputedStyle(desc).fontSize,descColor:getComputedStyle(desc).color,descLines:Math.round(desc.getBoundingClientRect().height/parseFloat(getComputedStyle(desc).lineHeight))};});console.log('DIALOG',JSON.stringify(dia));
await b.close();
