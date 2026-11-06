import fs from 'node:fs';import path from 'node:path';import {chromium} from '@playwright/test';
function loadEnv(f){const o={};for(const l of fs.readFileSync(f,'utf8').split('\n')){const m=l.match(/^([A-Z0-9_]+)=(.*)$/);if(m)o[m[1]]=m[2].replace(/^["']|["']$/g,'');}return o;}
const env=loadEnv(path.resolve('../.env'));
const browser=await chromium.launch();
async function login(p){await p.goto('http://127.0.0.1:3000/admin/login',{waitUntil:'networkidle'});await p.fill('#username',env.TEST_USERNAME);await p.fill('#password',env.TEST_PASSWORD);await p.click('button[type=submit]');await p.waitForURL(u=>!u.pathname.startsWith('/admin/login'),{timeout:30000});}
async function measure(width,height,name){
 const ctx=await browser.newContext({viewport:{width,height},deviceScaleFactor:2,locale:'zh-CN'});const p=await ctx.newPage();await login(p);
 await p.goto('http://127.0.0.1:3000/admin/merchant/companies',{waitUntil:'networkidle'});await p.waitForTimeout(700);
 const data=await p.evaluate(()=>{
  const all=[...document.querySelectorAll('body *')];
  const visible=all.filter(n=>{const r=n.getBoundingClientRect();return r.width>0&&r.height>0&&getComputedStyle(n).visibility!=='hidden';});
  const textNodes=visible.filter(n=>[...n.childNodes].some(c=>c.nodeType===3&&c.textContent.trim()));
  const dist={};
  for(const n of textNodes){const cs=getComputedStyle(n);const key=`${cs.fontSize}/${cs.fontWeight}`;dist[key]=(dist[key]||0)+1;}
  const sizes={};for(const [k,v] of Object.entries(dist)){const s=k.split('/')[0];sizes[s]=(sizes[s]||0)+v;}
  const buttonStats=all.filter(n=>n.tagName==='BUTTON').map(b=>{const cs=getComputedStyle(b);return {text:(b.innerText||b.getAttribute('aria-label')||'').trim().slice(0,20),variant:cs.backgroundColor==='rgb(23, 25, 28)'?'filled':'other',radius:cs.borderRadius,h:Math.round(b.getBoundingClientRect().height),font:cs.fontSize+'/'+cs.fontWeight};});
  const rows=[...document.querySelectorAll('tbody tr')].map(r=>Math.round(r.getBoundingClientRect().height));
  const table=document.querySelector('table'); const wrap=table?.parentElement;
  const cards=[...document.querySelectorAll('.rounded-cards')].map(c=>{const cs=getComputedStyle(c);return {w:Math.round(c.getBoundingClientRect().width),radius:cs.borderRadius,pad:cs.padding,shadow:cs.boxShadow.slice(0,80)};});
  const inputs=[...document.querySelectorAll('input')].map(i=>{const cs=getComputedStyle(i);return {ph:i.placeholder?.slice(0,20),radius:cs.borderRadius,h:Math.round(i.getBoundingClientRect().height),font:cs.fontSize};});
  return {viewport:[innerWidth,innerHeight],textDist:dist,sizeDist:sizes,buttons:buttonStats,rows,table:{wrapClient:wrap?.clientWidth,wrapScroll:wrap?.scrollWidth,tableW:table?.getBoundingClientRect().width},cards,inputs,docW:document.documentElement.scrollWidth};
 });console.log(name,JSON.stringify(data));await ctx.close();return data;
}
const out={};out[1440]=await measure(1440,1000,'1440');out[1024]=await measure(1024,900,'1024');out[768]=await measure(768,900,'768');out['390']=await measure(390,844,'390');
fs.writeFileSync('../tmp/unslop/companies-metrics.json',JSON.stringify(out,null,2));await browser.close();
