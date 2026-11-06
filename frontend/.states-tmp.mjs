import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';
function loadEnv(file){const out={};for(const line of fs.readFileSync(file,'utf8').split('\n')){const m=line.match(/^([A-Z0-9_]+)=(.*)$/);if(m)out[m[1]]=m[2].replace(/^["']|["']$/g,'');}return out;}
const env=loadEnv(path.resolve('../.env'));
const browser=await chromium.launch();
async function login(page){
  await page.goto('http://127.0.0.1:3000/admin/login',{waitUntil:'networkidle'});
  await page.fill('#username',env.TEST_USERNAME); await page.fill('#password',env.TEST_PASSWORD);
  await page.click('button[type=submit]');
  await page.waitForURL(u=>!u.pathname.startsWith('/admin/login'),{timeout:30000});
}
// desktop states
const ctx=await browser.newContext({viewport:{width:1440,height:1000},deviceScaleFactor:2,locale:'zh-CN'});
const page=await ctx.newPage(); await login(page);
await page.goto('http://127.0.0.1:3000/admin/merchant/companies',{waitUntil:'networkidle'}); await page.waitForTimeout(800);
// edit first row
await page.locator('tbody tr').first().locator('button:has-text("编辑")').evaluate(b=>b.click());
await page.waitForTimeout(500);
await page.screenshot({path:'../tmp/unslop/companies-edit.png',fullPage:true});
const editInfo=await page.evaluate(()=>{
  const card=[...document.querySelectorAll('.rounded-cards')].find(c=>c.textContent.includes('编辑公司'));
  const inputs=[...card.querySelectorAll('input')];
  const btns=[...card.querySelectorAll('button')];
  return {cardTitle:card.querySelector('div')?.innerText, cardH:card.getBoundingClientRect().height, inputs:inputs.map(i=>({h:i.getBoundingClientRect().height,r:getComputedStyle(i).borderRadius,fs:getComputedStyle(i).fontSize})), buttons:btns.map(b=>({t:b.innerText,h:b.getBoundingClientRect().height,r:getComputedStyle(b).borderRadius,bg:getComputedStyle(b).backgroundColor,color:getComputedStyle(b).color}))};
});
console.log('EDIT',JSON.stringify(editInfo));
// delete dialog
await page.locator('tbody tr').first().locator('button:has-text("删除")').evaluate(b=>b.click());
await page.waitForTimeout(500);
await page.screenshot({path:'../tmp/unslop/companies-delete-dialog.png',fullPage:true});
const dialogInfo=await page.evaluate(()=>{
  const d=document.querySelector('[role=dialog]');
  const all=[...d.querySelectorAll('button,input')];
  return {box:d.getBoundingClientRect().toJSON(),r:getComputedStyle(d).borderRadius,pad:getComputedStyle(d).padding,items:all.map(n=>({tag:n.tagName,t:n.innerText||n.placeholder,h:n.getBoundingClientRect().height,r:getComputedStyle(n).borderRadius,fs:getComputedStyle(n).fontSize,bg:getComputedStyle(n).backgroundColor}))};
});
console.log('DIALOG',JSON.stringify(dialogInfo));
await page.keyboard.press('Escape');
// empty search
await page.fill('input[placeholder*="公司名称搜索"]','ZZZ_NO_MATCH_999');
await page.click('button:has-text("查询")'); await page.waitForTimeout(800);
await page.screenshot({path:'../tmp/unslop/companies-empty.png',fullPage:true});
console.log('EMPTY_TEXT', (await page.locator('tbody').innerText()).slice(0,200));
await ctx.close();
// mobile
const mctx=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,locale:'zh-CN'});
const mp=await mctx.newPage(); await login(mp);
await mp.goto('http://127.0.0.1:3000/admin/merchant/companies',{waitUntil:'networkidle'}); await mp.waitForTimeout(800);
await mp.screenshot({path:'../tmp/unslop/companies-mobile.png',fullPage:true});
const mDims=await mp.evaluate(()=>({docW:document.documentElement.scrollWidth,winW:innerWidth,tblWrap:[...document.querySelectorAll('table')].map(t=>({client:t.parentElement.clientWidth,scroll:t.parentElement.scrollWidth}))}));
console.log('MOBILE',JSON.stringify(mDims));
await browser.close();
