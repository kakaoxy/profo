import fs from 'node:fs';import path from 'node:path';import {chromium} from '@playwright/test';
function loadEnv(f){const o={};for(const l of fs.readFileSync(f,'utf8').split('\n')){const m=l.match(/^([A-Z0-9_]+)=(.*)$/);if(m)o[m[1]]=m[2].replace(/^["']|["']$/g,'');}return o;}
const env=loadEnv(path.resolve('../.env'));const b=await chromium.launch();
const c=await b.newContext({viewport:{width:1440,height:1000},deviceScaleFactor:2,locale:'zh-CN'});const p=await c.newPage();
await p.goto('http://127.0.0.1:3000/admin/login',{waitUntil:'networkidle'});await p.fill('#username',env.TEST_USERNAME);await p.fill('#password',env.TEST_PASSWORD);await p.click('button[type=submit]');await p.waitForURL(u=>!u.pathname.startsWith('/admin/login'),{timeout:30000});
for (const [w,h] of [[1024,900],[768,900]]) { await p.setViewportSize({width:w,height:h}); await p.goto('http://127.0.0.1:3000/admin/merchant/companies',{waitUntil:'networkidle'}); await p.waitForTimeout(700); await p.screenshot({path:`../tmp/unslop/companies-${w}.png`,fullPage:true}); }
await b.close();
