// 商户管理 V08 · 后台高德 Key 配置与真实地图加载 E2E
//
// 前置：后端 :8000 + 前端 :3000；E2E_ADMIN_USER / E2E_ADMIN_PASSWORD 从环境变量读取。
// - E2E_AMAP_KEY：后台保存用的高德 Web端(JS API) Key（未提供时整文件跳过）
// - E2E_AMAP_SECURITY_CODE：该 Key 的安全密钥（2021-12-02 后申请的 Key 必填）
// - E2E_AMAP_EXPECT_LOAD=1：确认该 Key 可加载（含域名白名单已放行 :3000）时，才跑真实地图断言
// Key/安全密钥通过后台「系统设置 → 高德地图」保存到 system_configs，不写入仓库。

import { test, expect } from "@playwright/test";
import { loginPage } from "./helpers/auth";

test.describe.configure({ mode: "serial" });

const AMAP_KEY = process.env.E2E_AMAP_KEY ?? "";
const AMAP_SECURITY_CODE = process.env.E2E_AMAP_SECURITY_CODE ?? "";
const EXPECT_LOAD = process.env.E2E_AMAP_EXPECT_LOAD === "1";

test.skip(!AMAP_KEY, "未提供 E2E_AMAP_KEY，跳过高德配置 E2E");

test.beforeEach(async ({ page }) => {
  test.setTimeout(120_000);
  await loginPage(page);
});

test("后台保存高德 Key 与安全密钥并标记已配置", async ({ page }) => {
  await page.goto("/admin/settings/amap");
  const input = page.getByPlaceholder("请输入高德 Web 端（JS API）Key");
  const securityInput = page.getByPlaceholder("请输入高德 Web 端（JS API）安全密钥");
  await expect(input).toBeVisible({ timeout: 15_000 });

  const keyChanged = (await input.inputValue()) !== AMAP_KEY;
  const securityChanged = (await securityInput.inputValue()) !== AMAP_SECURITY_CODE;
  if (keyChanged || securityChanged) {
    await input.fill(AMAP_KEY);
    await securityInput.fill(AMAP_SECURITY_CODE);
    await page.getByRole("button", { name: "保存" }).click();
  }
  await expect(page.getByText("已配置").first()).toBeVisible({ timeout: 15_000 });
});

test("地图页加载真实 AMap", async ({ page }) => {
  test.skip(!EXPECT_LOAD, "未确认 E2E_AMAP_KEY 为可加载的 Web端(JS API) Key，跳过真实地图断言");
  await page.goto("/admin/merchant/map");
  // AMap JS API 初始化后会在容器内创建 .amap-container
  await expect(page.locator(".amap-container").first()).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText("未配置高德地图 Key")).toHaveCount(0);
  await expect(page.getByText("地图配置加载中…")).toHaveCount(0);
});

test("轨迹页复用同一 Key 加载真实 AMap", async ({ page }) => {
  test.skip(!EXPECT_LOAD, "未确认 E2E_AMAP_KEY 为可加载的 Web端(JS API) Key，跳过真实地图断言");
  await page.goto("/admin/merchant/tracks");
  await expect(page.locator(".amap-container").first()).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText("未配置高德地图 Key")).toHaveCount(0);
});
