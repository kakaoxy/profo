import fs from 'node:fs';import path from 'node:path';import {chromium} from '@playwright/test';
function loadEnv(f){const o={};for(const l of fs.readFileSync(f,'utf8').split('\n')){const m=l.match(/^([A-Z0-9_]+)=(.*)$/);if(m)o[m[1]]=m[2].replace(/^["']|["']$/g,'');}return o;}
const env=loadEnv(path.resolve('../.env'));const b=await chromium.launch();const c=await b.newContext({viewport:{width:1440,height:1000},deviceScaleFactor:1,locale:'zh-CN'});const p=await c.newPage();
await p.goto('http://127.0.0.1:3000/admin/login',{waitUntil:'networkidle'});await p.fill('#username',env.TEST_USERNAME);await p.fill('#password',env.TEST_PASSWORD);await p.click('button[type=submit]');await p.waitForURL(u=>!u.pathname.startsWith('/admin/login'),{timeout:30000});
const out={};
for(const [w,h] of [[1440,1000],[1024,900],[768,900],[390,844]]){
 await p.setViewportSize({width:w,height:h});await p.goto('http://127.0.0.1:3000/admin/merchant/companies',{waitUntil:'networkidle'});await p.waitForTimeout(500);
 out[w]=await p.evaluate(()=>{
  const rect=(el)=>el?(()=>{const r=el.getBoundingClientRect();return {x:+r.x.toFixed(1),y:+r.y.toFixed(1),w:+r.width.toFixed(1),h:+r.height.toFixed(1),right:+r.right.toFixed(1)}})():null;
  const cards=[...document.querySelectorAll('main .rounded-cards')];
  const table=document.querySelector('table');const wrap=table?.parentElement;const grid=table?.closest('.grid');
  const header=document.querySelector('thead tr');
  const btns=[...document.querySelectorAll('main button')];const mainContent=document.querySelector('main');
  const small=[...mainContent.querySelectorAll('*')].filter(el=>el.children.length===0&&el.textContent.trim()&&parseFloat(getComputedStyle(el).fontSize)<=12&&!['工作台','房源','线索','更多'].includes(el.textContent.trim())).map(el=>({text:el.textContent.trim().slice(0,12),size:getComputedStyle(el).fontSize,weight:getComputedStyle(el).fontWeight,color:getComputedStyle(el).color}));
  const rows=[...document.querySelectorAll('tbody tr')].map(tr=>+tr.getBoundingClientRect().height.toFixed(1));
  const filled=btns.filter(b=>{const bg=getComputedStyle(b).backgroundColor;return bg==='rgb(23, 25, 28)'});
  return {docW:document.documentElement.scrollWidth,bodyW:document.body.scrollWidth,main:rect(document.querySelector('main')),filterCard:rect(cards[0]),tableCard:rect(cards[1]),formCard:rect(cards[2]),grid:grid?{rect:rect(grid),scrollW:grid.scrollWidth,clientW:grid.clientWidth}:null,table:rect(table),wrap:wrap?{clientW:wrap.clientWidth,scrollW:wrap.scrollWidth}:null,thead:rect(header),rowHeights:rows,buttonCount:btns.length,filledCount:filled.length,filledTexts:filled.map(b=>b.textContent.trim()),smallCount:small.length,small,screen:{w:innerWidth,h:innerHeight}};
 });
}
fs.writeFileSync('../tmp/unslop/companies-breakpoints.json',JSON.stringify(out,null,2));
console.log(JSON.stringify(out,null,2));
await b.close();
