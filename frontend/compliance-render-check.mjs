// 广告法整改渲染态验证（可重跑，报告 §8.3 复核方式）
// 用法：cd frontend && node e2e-artifacts-compliance.mjs（需 :3000 前端、:8000 后端运行中）
// 产出工件：tmp/compliance-e2e/*.txt
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3000";
const DIR = "tmp/compliance-e2e";
mkdirSync(DIR, { recursive: true });

const checks = [];
async function grab(browser, path, name, expectTrue = [], expectFalse = []) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(BASE + path, { waitUntil: "networkidle" });
  const text = await page.evaluate(() => document.body.innerText);
  const result = { path, name };
  for (const s of expectTrue) result[`含「${s}」`] = text.includes(s);
  for (const s of expectFalse) result[`不含「${s}」`] = !text.includes(s);
  writeFileSync(`${DIR}/${name}.txt`, text);
  checks.push(result);
  await page.close();
}

const browser = await chromium.launch();
await grab(browser, "/about", "about",
  ["未售出情形按合同约定处理", "业主不出装修款", "装修归属以合同条款为准", "挂牌后缺少持续运营"],
  ["零成本", "零风险", "免费得一套装修", "0现金损失", "业主都不亏", "一票否决权", "中介只挂牌"]);
await grab(browser, "/contact", "contact",
  ["过往案例", "价格面议", "建筑面积"],
  ["真实成交价可查", "0天成交"]);
await grab(browser, "/projects/308", "project-308-sold",
  ["成交价", "216", "建筑面积", "挂牌价，可能随市场调整"],
  ["元/㎡"]);
await grab(browser, "/projects/303", "project-303-onsale",
  ["挂牌价", "万/㎡", "建筑面积"],
  ["元/㎡"]);
await grab(browser, "/", "home",
  ["实景拍摄，改造过程可查"],
  ["每套皆标杆", "照骗", "真实成交价可查"]);
await grab(browser, "/login", "login",
  ["装修款由公司垫付"],
  ["零成本", "零风险", "严格保密"]);
await grab(browser, "/register", "register",
  ["服务条款", "隐私政策"], []);
await grab(browser, "/terms", "terms",
  ["美房宝用户协议"], ["404"]);
await grab(browser, "/privacy", "privacy",
  ["美房宝隐私政策"], ["404"]);
// /valuation 受保护：未登录被布局守卫重定向到 /login（NEXT_REDIRECT 链）；
// 登录态文案渲染需真实凭据，由 e2e/ 既有用例覆盖
await grab(browser, "/valuation", "valuation-redirects-to-login",
  ["欢迎回来"], ["适合什么卖法"]);
await browser.close();

let fail = 0;
for (const r of checks) {
  console.log(`\n== ${r.name} (${r.path})`);
  for (const [k, v] of Object.entries(r)) {
    if (k === "path" || k === "name") continue;
    console.log(`  ${v ? "PASS" : "FAIL"} ${k}`);
    if (!v) fail++;
  }
}
console.log(`\n总计失败断言: ${fail}`);
process.exit(fail ? 1 : 0);
