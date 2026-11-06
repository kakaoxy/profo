import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';

function loadEnv(file) {
  const out = {};
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}
const env = loadEnv(path.resolve('../.env'));
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2, locale: 'zh-CN' });
const page = await ctx.newPage();
await page.goto('http://127.0.0.1:3000/admin/login', { waitUntil: 'networkidle' });
await page.fill('#username', env.TEST_USERNAME);
await page.fill('#password', env.TEST_PASSWORD);
await page.click('button[type=submit]');
await page.waitForURL((url) => !url.pathname.startsWith('/admin/login'), { timeout: 30000 }).catch(()=>{});
console.log('after login url:', page.url());
await page.goto('http://127.0.0.1:3000/admin/merchant/companies', { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
console.log('final url:', page.url());
await page.screenshot({ path: '../tmp/unslop/companies-desktop.png', fullPage: true });
const text = await page.locator('body').innerText();
console.log(text.slice(0, 1200));
await browser.close();
