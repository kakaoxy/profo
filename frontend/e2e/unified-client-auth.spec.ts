import { test, expect, request as playwrightRequest } from "@playwright/test";
import { loginPage, createApiContext, FRONTEND_BASE } from "./helpers/auth";

/**
 * 统一请求/认证层 E2E（techdebt-config-unify §4 T2.4 可复验工件）.
 *
 * 验证「身份由路由组显式决定，而非 pathname 嗅探」：
 * 1. admin 路由组（(main)）：access token 失效 → 客户端自动刷新走 `/api/auth/refresh` → 续传成功；
 * 2. C 端路由组（(c)）：access token 失效 → 自动刷新走 `/api/auth/c/refresh` → 续传成功，
 *    且**全程不触碰 admin 刷新端点**（F1 反向语义：共用请求层按渲染所在路由组选端点）。
 *
 * 模拟过期方式：页面加载成功后把 access token cookie 替换为非法值（refresh token 保持有效），
 * 再触发一次客户端请求 —— 与真实「令牌过期但会话可刷新」等价，且不改任何业务数据。
 *
 * 造数：C 端账号经 `/api/v1/public/auth/register` 注册（唯一用户名），afterAll 由 admin 删除。
 */

// 串行执行：两条用例共享同一 C 端测试账号（beforeAll 只跑一次，避免并行 worker 重复注册）
test.describe.configure({ mode: "serial" });

const HOST = new URL(FRONTEND_BASE).hostname;
const API_BASE = process.env.E2E_API_BASE ?? "http://127.0.0.1:8000";
const EXPIRED_TOKEN = "e2e.expired.token";

interface Tokens {
  accessToken: string;
  refreshToken: string;
}

let api: Awaited<ReturnType<typeof createApiContext>>;
let customer: Tokens & { id: string };

/** 采集 /api/auth* 的 POST 请求（刷新端点断言用） */
function collectAuthPosts(page: import("@playwright/test").Page): string[] {
  const posts: string[] = [];
  page.on("request", (req) => {
    if (req.method() === "POST" && req.url().includes("/api/auth")) posts.push(req.url());
  });
  return posts;
}

test.beforeAll(async () => {
  api = await createApiContext();
  const suffix = `${Date.now().toString().slice(-6)}${Math.random().toString(36).slice(2, 6)}`;
  const username = `e2e_c_auth_${suffix}`;
  const ctx = await playwrightRequest.newContext();
  try {
    const res = await ctx.post(`${API_BASE}/api/v1/public/auth/register`, {
      data: { username, password: "E2ePass!2026", nickname: "E2E 客户端认证" },
    });
    if (!res.ok()) throw new Error(`C 端注册失败: HTTP ${res.status()} ${await res.text()}`);
    const body = (await res.json()) as {
      access_token: string;
      refresh_token: string;
      user: { id: string };
    };
    customer = {
      accessToken: body.access_token,
      refreshToken: body.refresh_token,
      id: body.user.id,
    };
  } finally {
    await ctx.dispose();
  }
});

test.afterAll(async () => {
  if (api && customer?.id) {
    const res = await api.ctx.delete(`/api/v1/users/${customer.id}`);
    expect(res.ok() || res.status() === 204).toBeTruthy();
  }
  await api?.dispose();
});

test("admin 路由组：access token 失效 → 走 /api/auth/refresh 刷新并续传", async ({ page }) => {
  const authPosts = collectAuthPosts(page);
  await loginPage(page);

  await page.goto(`${FRONTEND_BASE}/admin/settings/dicts`);
  await expect(page.getByTestId("dict-group-recruit_source")).toBeVisible();

  // 模拟 access token 过期（refresh token 仍有效）
  await page
    .context()
    .addCookies([{ name: "access_token", value: EXPIRED_TOKEN, domain: HOST, path: "/" }]);

  // 触发一次带 401 的客户端请求：切换字典组 → GET /admin/dicts/recruit_source/items
  const retried = page.waitForResponse(
    (res) => res.url().includes("/admin/dicts/recruit_source/items") && res.status() === 200,
  );
  await page.getByTestId("dict-group-recruit_source").click();
  await retried;

  // 续传成功：条目渲染（证明重试拿到了新 token）
  await expect(page.getByTestId("dict-row-card")).toBeVisible();

  expect(authPosts.some((url) => url.includes("/api/auth/refresh"))).toBe(true);
  expect(authPosts.some((url) => url.includes("/api/auth/c/refresh"))).toBe(false);
});

test("C 端路由组：access token 失效 → 走 /api/auth/c/refresh 刷新并续传", async ({ page }) => {
  const authPosts = collectAuthPosts(page);

  await page.context().addCookies([
    {
      name: "c_access_token",
      value: customer.accessToken,
      domain: HOST,
      path: "/",
      httpOnly: true,
    },
    {
      name: "c_refresh_token",
      value: customer.refreshToken,
      domain: HOST,
      path: "/",
      httpOnly: true,
    },
  ]);

  await page.goto(`${FRONTEND_BASE}/my`);
  await expect(page).toHaveURL(/\/my$/);

  // SWR 全局配置关闭了 revalidateOnFocus，但保留 revalidateOnReconnect：
  // 用 online 事件触发重新校验（等价于网络恢复后的自动重取），不依赖页面交互。
  // dedupe 窗口 2s：等待后模拟过期，再触发重校验
  await page.waitForTimeout(2500);
  await page
    .context()
    .addCookies([
      { name: "c_access_token", value: EXPIRED_TOKEN, domain: HOST, path: "/", httpOnly: true },
    ]);

  const retried = page.waitForResponse(
    (res) => res.url().includes("/public/leads/mine") && res.status() === 200,
  );
  await page.evaluate(() => {
    window.dispatchEvent(new Event("online"));
  });
  await retried;

  // 刷新增效：会话仍有效（未被踢回登录页）
  await expect(page).toHaveURL(/\/my$/);

  expect(authPosts.some((url) => url.includes("/api/auth/c/refresh"))).toBe(true);
  expect(authPosts.some((url) => url.includes("/api/auth/refresh"))).toBe(false);
});
