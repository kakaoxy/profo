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
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1, locale: 'zh-CN' });
const page = await ctx.newPage();
await page.goto('http://127.0.0.1:3000/admin/login', { waitUntil: 'networkidle' });
await page.fill('#username', env.TEST_USERNAME);
await page.fill('#password', env.TEST_PASSWORD);
await page.click('button[type=submit]');
await page.waitForURL((url) => !url.pathname.startsWith('/admin/login'), { timeout: 30000 }).catch(()=>{});
await page.goto('http://127.0.0.1:3000/admin/projects?status=signing', { waitUntil: 'networkidle' });
await page.waitForTimeout(1000);
const hrefs = await page.locator('a[href*="/admin/projects/"]').evaluateAll((els) => els.map((el) => el.getAttribute('href')));
const first = [...new Set(hrefs)].find((h) => /\/admin\/projects\/[0-9a-f-]{36}/.test(h || ''));
console.log('links', hrefs.slice(0,5), 'first', first);
if (first) {
  await page.goto('http://127.0.0.1:3000' + first, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  console.log('url', page.url(), 'body', (await page.locator('body').innerText()).slice(0,200));
  await page.screenshot({ path: '../tmp/projects-shots/current-signing-final.png', fullPage: true });
}
await browser.close();
