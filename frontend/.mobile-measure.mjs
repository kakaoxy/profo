import fs from 'node:fs';import path from 'node:path';import {chromium} from '@playwright/test';
function loadEnv(f){const o={};for(const l of fs.readFileSync(f,'utf8').split('\n')){const m=l.match(/^([A-Z0-9_]+)=(.*)$/);if(m)o[m[1]]=m[2].replace(/^["']|["']$/g,'');}return o;}
const env=loadEnv(path.resolve('../.env'));const b=await chromium.launch();const c=await b.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,locale:'zh-CN'});const p=await c.newPage();
await p.goto('http://127.0.0.1:3000/admin/login',{waitUntil:'networkidle'});await p.fill('#username',env.TEST_USERNAME);await p.fill('#password',env.TEST_PASSWORD);await p.click('button[type=submit]');await p.waitForURL(u=>!u.pathname.startsWith('/admin/login'),{timeout:30000});
await p.goto('http://127.0.0.1:3000/admin/merchant/companies',{waitUntil:'networkidle'});await p.waitForTimeout(700);
const d=await p.evaluate(()=>{
 const table=document.querySelector('table'); const wrap=table.parentElement; const card=wrap.parentElement; const grid=card.parentElement; const pc=document.querySelector('main')||document.body;
 const box=n=>{const r=n.getBoundingClientRect();return {x:r.x,w:r.width,right:r.right,client:n.clientWidth,scroll:n.scrollWidth,overflowX:getComputedStyle(n).overflowX,minW:getComputedStyle(n).minWidth}};
 return {table:box(table),wrap:box(wrap),card:box(card),grid:box(grid),page:box(pc),bodyOverflow:getComputedStyle(document.body).overflowX,htmlOverflow:getComputedStyle(document.documentElement).overflowX};
});console.log(JSON.stringify(d,null,2));await b.close();
