import { APIRequestContext, Page, request as playwrightRequest } from "@playwright/test";

/**
 * E2E 登录助手（spec §7 基建约定）.
 *
 * - 账号密码读环境变量 E2E_ADMIN_USER / E2E_ADMIN_PASSWORD，严禁硬编码
 * - 后端登录端点速率限制 5次/分钟 → 每个测试进程只登录一次，
 *   token 缓存在模块级变量中复用
 * - 前端会话通过 httpOnly cookie `access_token` / `refresh_token` 承载
 *   （与 src/admin-auth.ts 的 cookieOptions 对齐）
 */

const API_BASE = process.env.E2E_API_BASE ?? "http://127.0.0.1:8000";
const FRONT_BASE = process.env.E2E_FRONT_BASE ?? "http://127.0.0.1:3000";

let cachedToken: string | null = null;

/** 获取 admin access token（进程内缓存，规避登录限流）. */
export async function getAdminToken(): Promise<string> {
  if (cachedToken) return cachedToken;

  const username = requireEnv("E2E_ADMIN_USER");
  const password = requireEnv("E2E_ADMIN_PASSWORD");

  const ctx = await playwrightRequest.newContext();
  try {
    const res = await ctx.post(`${API_BASE}/api/v1/auth/login`, {
      data: { username, password },
      headers: { "Content-Type": "application/json" },
    });
    if (!res.ok()) {
      throw new Error(
        `E2E 登录失败: HTTP ${res.status()} ${await res.text()}`.slice(0, 300),
      );
    }
    const body = (await res.json()) as { access_token: string };
    cachedToken = body.access_token;
    return cachedToken;
  } finally {
    await ctx.dispose();
  }
}

/** 将登录态注入浏览器页面（httpOnly cookie 直写）. */
export async function loginPage(page: Page): Promise<void> {
  const token = await getAdminToken();
  await page.context().addCookies([
    {
      name: "access_token",
      value: token,
      domain: "127.0.0.1",
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    },
    {
      name: "refresh_token",
      value: token,
      domain: "127.0.0.1",
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
}

/** 创建携带登录态的 API 请求上下文（造数/清理用）. */
export async function createApiContext(): Promise<{
  ctx: APIRequestContext;
  dispose: () => Promise<void>;
}> {
  const token = await getAdminToken();
  const ctx = await playwrightRequest.newContext({
    baseURL: API_BASE,
    extraHTTPHeaders: { Authorization: `Bearer ${token}` },
  });
  return { ctx, dispose: () => ctx.dispose() };
}

/** 创建带登录 cookie 的浏览器上下文选项（test.use 中使用）. */
export const FRONTEND_BASE = FRONT_BASE;

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(
      `缺少环境变量 ${name}。请在 frontend/.env.local 或 shell 中提供（账号密码严禁硬编码）。`,
    );
  }
  return v;
}
