import fs from 'node:fs';import path from 'node:path';import {chromium} from '@playwright/test';
function loadEnv(f){const o={};for(const l of fs.readFileSync(f,'utf8').split('\n')){const m=l.match(/^([A-Z0-9_]+)=(.*)$/);if(m)o[m[1]]=m[2].replace(/^["']|["']$/g,'');}return o;}
const env=loadEnv(path.resolve('../.env'));const b=await chromium.launch();const c=await b.newContext({viewport:{width:1440,height:1000},deviceScaleFactor:2,locale:'zh-CN'});const p=await c.newPage();
await p.goto('http://127.0.0.1:3000/admin/login',{waitUntil:'networkidle'});await p.fill('#username',env.TEST_USERNAME);await p.fill('#password',env.TEST_PASSWORD);await p.click('button[type=submit]');await p.waitForURL(u=>!u.pathname.startsWith('/admin/login'),{timeout:30000});
await p.goto('http://127.0.0.1:3000/admin/merchant/companies',{waitUntil:'networkidle'});await p.waitForTimeout(700);
const data=await p.evaluate(()=>{
 const main=document.querySelector('main')||document.body;
 const cs=(el)=>{const s=getComputedStyle(el);return {fontFamily:s.fontFamily,fontSize:s.fontSize,fontWeight:s.fontWeight,lineHeight:s.lineHeight,letterSpacing:s.letterSpacing,color:s.color,background:s.backgroundColor,borderRadius:s.borderRadius,height:Math.round(el.getBoundingClientRect().height*10)/10,width:Math.round(el.getBoundingClientRect().width*10)/10,padding:s.padding,boxShadow:s.boxShadow,border:s.border,outline:s.outline}};
 const small=[...main.querySelectorAll('*')].filter(el=>el.children.length===0&&el.textContent.trim()&&parseFloat(getComputedStyle(el).fontSize)<=12).map(el=>({tag:el.tagName,text:el.textContent.trim().slice(0,40),class:el.className.toString().slice(0,120),...cs(el)}));
 const buttons=[...main.querySelectorAll('button')].map(el=>({text:(el.textContent||'').trim().replace(/\s+/g,' ').slice(0,20),aria:el.getAttribute('aria-label'),disabled:el.disabled,...cs(el)}));
 const ths=[...document.querySelectorAll('thead th')].map(el=>({text:el.textContent.trim(),...cs(el)}));
 const rows=[...document.querySelectorAll('tbody tr')].map(tr=>({h:Math.round(tr.getBoundingClientRect().height*10)/10,cells:[...tr.children].map(td=>({text:td.textContent.trim().slice(0,24),w:Math.round(td.getBoundingClientRect().width),h:Math.round(td.getBoundingClientRect().height),scrollW:td.scrollWidth,clientW:td.clientWidth,whiteSpace:getComputedStyle(td).whiteSpace,overflow:getComputedStyle(td).overflow}))}));
 const table=document.querySelector('table');const wrap=table?.parentElement;
 const all=[...document.querySelectorAll('*')];const overflow=all.filter(el=>{const r=el.getBoundingClientRect();return r.right>innerWidth+1&&getComputedStyle(el).position!=='fixed'}).slice(0,10).map(el=>({tag:el.tagName,class:el.className.toString().slice(0,100),right:Math.round(el.getBoundingClientRect().right),width:Math.round(el.getBoundingClientRect().width)}));
 return {
  viewport:[innerWidth,innerHeight],bodyFont:cs(document.body),h1:cs(document.querySelector('h1')),tdFont:cs(document.querySelector('tbody td')),btnFont:cs(document.querySelector('main button')),
  interLoaded:document.fonts.check('16px Inter'),serifLoaded:document.fonts.check('44px "Source Serif 4"'),
  small,buttonCount:buttons.length,inks:buttons.filter(x=>x.background.includes('23, 25, 28')||x.background==='rgb(23, 25, 28)').map(x=>({text:x.text,w:x.width,h:x.height,radius:x.borderRadius,font:x.fontSize,weight:x.fontWeight})),
  buttons:buttons.slice(0,6),ths,rows,wrap:wrap?{clientW:wrap.clientWidth,scrollW:wrap.scrollWidth}:null,table:table?{w:table.getBoundingClientRect().width}:null,overflow,bodyBg:getComputedStyle(document.body).backgroundColor,mainBg:getComputedStyle(document.querySelector('main')).backgroundColor
 };
});
fs.writeFileSync('../tmp/unslop/companies-audit-metrics.json',JSON.stringify(data,null,2));
console.log(JSON.stringify({viewport:data.viewport,bodyFont:data.bodyFont,h1:data.h1,tdFont:data.tdFont,interLoaded:data.interLoaded,serifLoaded:data.serifLoaded,smallCount:data.small.length,small:data.small.map(x=>({tag:x.tag,text:x.text,size:x.fontSize,weight:x.fontWeight,color:x.color,line:x.lineHeight})),buttonCount:data.buttonCount,inks:data.inks,rows:data.rows.map(r=>({h:r.h,cells:r.cells.map(c=>c.text+':'+c.w+'x'+c.h)}),),wrap:data.wrap,table:data.table,bodyBg:data.bodyBg,mainBg:data.mainBg,overflow:data.overflow},null,2));
// focus ring
const focus=await p.evaluate(()=>{const inp=document.querySelector('main input');inp.focus();const s=getComputedStyle(inp);const btn=document.querySelector('main button');btn.focus();const bs=getComputedStyle(btn);return {input:{outline:s.outline,boxShadow:s.boxShadow,borderColor:s.borderColor},button:{outline:bs.outline,boxShadow:bs.boxShadow}}});
console.log('FOCUS',JSON.stringify(focus,null,2));
// empty mobile
await p.setViewportSize({width:390,height:844});
await p.route('**/admin/merchant/companies?*',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({items:[],total:0,page:1})}));
await p.goto('http://127.0.0.1:3000/admin/merchant/companies',{waitUntil:'networkidle'});await p.waitForTimeout(500);await p.screenshot({path:'../tmp/unslop/companies-empty-mobile.png',fullPage:true});
const empty=await p.evaluate(()=>{const td=[...document.querySelectorAll('tbody td')][0];const table=document.querySelector('table');return {docW:document.documentElement.scrollWidth,tableW:table?.getBoundingClientRect().width,tdRect:td?{x:td.getBoundingClientRect().x,w:td.getBoundingClientRect().width,text:td.textContent.trim()}:null,wrapClient:table?.parentElement?.clientWidth,wrapScroll:table?.parentElement?.scrollWidth};});console.log('EMPTY_MOBILE',JSON.stringify(empty,null,2));
await c.close();await b.close();
