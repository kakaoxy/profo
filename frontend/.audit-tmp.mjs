import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';
function loadEnv(file){const out={};for(const line of fs.readFileSync(file,'utf8').split('\n')){const m=line.match(/^([A-Z0-9_]+)=(.*)$/);if(m)out[m[1]]=m[2].replace(/^["']|["']$/g,'');}return out;}
const env=loadEnv(path.resolve('../.env'));
const browser=await chromium.launch();
const ctx=await browser.newContext({viewport:{width:1440,height:1000},deviceScaleFactor:2,locale:'zh-CN'});
const page=await ctx.newPage();
await page.goto('http://127.0.0.1:3000/admin/login',{waitUntil:'networkidle'});
await page.fill('#username',env.TEST_USERNAME); await page.fill('#password',env.TEST_PASSWORD);
await page.click('button[type=submit]');
await page.waitForURL(u=>!u.pathname.startsWith('/admin/login'),{timeout:30000});
await page.goto('http://127.0.0.1:3000/admin/merchant/companies',{waitUntil:'networkidle'});
await page.waitForTimeout(1000);
const selectors = {
  pageTitle:'h1',
  desc:'h1 + p',
  filterCard:'main .rounded-cards, .rounded-cards',
  searchInput:'input[placeholder*="公司名称搜索"]',
  table:'table',
  tableHead:'thead',
  th:'thead th',
  firstTd:'tbody tr td',
  statusBadge:'tbody tr td:nth-child(4) span',
  actionCell:'tbody tr td:last-child',
  saveBtn:'button:has-text("保存")',
  queryBtn:'button:has-text("查询")',
  newBtn:'button:has-text("新建公司")',
  editBtn:'tbody tr button:has-text("编辑")',
  pagination:'div:has-text("每页")',
};
for (const [k,sel] of Object.entries(selectors)){
  const el = page.locator(sel).first();
  if(await el.count()===0){console.log(k,'NOT FOUND');continue;}
  const info = await el.evaluate((n)=>{
    const cs=getComputedStyle(n); const r=n.getBoundingClientRect();
    return {tag:n.tagName,text:(n.innerText||n.getAttribute('placeholder')||'').slice(0,80),font:cs.fontFamily,size:cs.fontSize,weight:cs.fontWeight,lineHeight:cs.lineHeight,color:cs.color,bg:cs.backgroundColor,radius:cs.borderRadius,border:cs.border,pad:cs.padding,shadow:cs.boxShadow,height:Math.round(r.height),width:Math.round(r.width)};
  });
  console.log(k, JSON.stringify(info));
}
// table container width vs table scroll width
const dims = await page.evaluate(()=>{
  const tbl=document.querySelector('table');
  const wrap=tbl.parentElement;
  const card=wrap.closest('.rounded-cards')||wrap.parentElement;
  const grid=card.parentElement;
  return {wrapClient:wrap.clientWidth, wrapScroll:wrap.scrollWidth, cardW:card.getBoundingClientRect().width, gridW:grid.getBoundingClientRect().width, tableW:tbl.getBoundingClientRect().width, bodyBG:getComputedStyle(document.body).backgroundColor, mainBG:getComputedStyle(document.querySelector('main')).backgroundColor};
});
console.log('dims',JSON.stringify(dims));
await browser.close();
