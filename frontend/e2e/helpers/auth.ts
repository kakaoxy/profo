import { APIRequestContext, Page, request as playwrightRequest } from "@playwright/test";

/**
 * E2E 登录助手（spec §7 基建约定）.
 *
 * - 账号密码读环境变量 E2E_ADMIN_USER / E2E_ADMIN_PASSWORD，严禁硬编码
 * - 后端登录端点速率限制 5次/分钟 → 每个测试进程只登录一次，
 *   token 缓存在模块级变量中复用
 * - 前端会话通过 httpOnly cookie `access_token` / `refresh_token` 承载
 *   （与 src/admin-auth.ts 的 cookieOptions 对齐）
 * - ⚠️ refresh_token cookie 必须写入**真实的 refresh_token**（type=refresh）：
 *   旧实现把 access_token 同时写进两个 cookie，令牌过期时 Next 刷新链路拿
 *   access_token 调 /auth/refresh，后端 utils/auth/token.py 校验 `type == "refresh"`
 *   必败 → 整套 E2E 永远覆盖不到「401 → 自动刷新 → 重定向」链路（AGENTS §2
 *   NEXT_REDIRECT 守卫所要保的那条链）。现同时缓存两个令牌并按名写入。
 * - cookie domain 从 FRONT_BASE 推导，不用E2E_FRONT_BASE=http://localhost:3000 时
 *   仍能正常注入（旧实现硬编码 127.0.0.1 → cookie 不随请求发送 → 全部用例未登录）。
 */

const API_BASE = process.env.E2E_API_BASE ?? "http://127.0.0.1:8000";
const FRONT_BASE = process.env.E2E_FRONT_BASE ?? "http://127.0.0.1:3000";

/** 前端访问地址的 host（去端口）——cookie domain 用。 */
const FRONT_HOST = new URL(FRONT_BASE).hostname;

interface AdminTokens {
  accessToken: string;
  refreshToken: string;
}

let cachedTokens: AdminTokens | null = null;

/** 获取 admin 令牌对（进程内缓存，规避登录限流 5次/分钟）. */
async function getAdminTokens(): Promise<AdminTokens> {
  if (cachedTokens) return cachedTokens;

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
    const body = (await res.json()) as {
      access_token: string;
      refresh_token?: string;
    };
    if (!body.refresh_token) {
      // 不降级：refresh_token 缺失会让会话过期链路不可测，立即报错而非静默跑出假成功
      throw new Error("E2E 登录响应缺少 refresh_token，无法注入完整会话 cookie");
    }
    cachedTokens = {
      accessToken: body.access_token,
      refreshToken: body.refresh_token,
    };
    return cachedTokens;
  } finally {
    await ctx.dispose();
  }
}

/** 获取 admin access token（保留导出，供只需 Authorization 头的场景）. */
export async function getAdminToken(): Promise<string> {
  return (await getAdminTokens()).accessToken;
}

/** 将登录态注入浏览器页面（httpOnly cookie 直写）. */
export async function loginPage(page: Page): Promise<void> {
  const { accessToken, refreshToken } = await getAdminTokens();
  await page.context().addCookies([
    {
      name: "access_token",
      value: accessToken,
      domain: FRONT_HOST,
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    },
    {
      // 真实 refresh_token（type=refresh）：使会话过期后的自动刷新链路可测
      name: "refresh_token",
      value: refreshToken,
      domain: FRONT_HOST,
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
