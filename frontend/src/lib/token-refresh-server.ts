/**
 * 服务端Token刷新管理器
 * 每个请求独立读取自己的 cookie，不跨用户共享 token
 *
 * 并发刷新通过 dedupServerRefresh 去重：refresh_token rotation 每次撤销旧 jti，
 * 不去重会导致并发请求中除第一个外全部失败（旧 refresh_token 已被撤销）。
 */

import { dedupServerRefresh } from "@/lib/auth/server/refresh-dedup";
import { logger } from "@/lib/logger";
import { cookies } from "next/headers";

interface RefreshResult {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

/** Access Token cookie 名（Admin 端，无前缀） */
const ACCESS_TOKEN_COOKIE = "access_token";
/** Refresh Token cookie 名（Admin 端，无前缀） */
const REFRESH_TOKEN_COOKIE = "refresh_token";

/** Cookie 通用配置（与 proxy.ts / route.ts 保持一致） */
const TOKEN_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  sameSite: "lax" as const,
};

/**
 * 从 Cookie 中读取 access_token
 * 每次请求独立读取，不使用全局缓存避免跨用户串号
 */
export async function getAccessTokenFromCookie(): Promise<string | null> {
  try {
    const cookieStore = await cookies();
    return cookieStore.get(ACCESS_TOKEN_COOKIE)?.value ?? null;
  } catch {
    return null;
  }
}

/**
 * 服务端Token刷新函数
 * 使用当前请求的 refresh_token cookie 向 /auth/refresh 换取新的 token pair
 *
 * 通过 dedupServerRefresh 以 refresh_token 为 key 去重：
 * 同一 refresh_token 在 2 秒内的多次调用共享同一 Promise，
 * 避免并发触发后端 rotation 导致后续请求失败。
 */
export async function refreshTokenServer(): Promise<RefreshResult | null> {
  try {
    const cookieStore = await cookies();
    const refreshToken = cookieStore.get(REFRESH_TOKEN_COOKIE)?.value;

    if (!refreshToken) {
      logger.warn("无 refresh_token，无法刷新");
      return null;
    }

    // 动态导入避免循环依赖
    const { apiPaths, getApiUrl } = await import("./config");

    // 以 refresh_token 为 key 去重，防止并发刷新触发 rotation 竞态
    const result = await dedupServerRefresh(refreshToken, async () => {
      const response = await fetch(getApiUrl(apiPaths.auth.refresh), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });

      if (!response.ok) {
        return { ok: false as const, status: response.status };
      }

      const data: RefreshResult = await response.json();
      return { ok: true as const, data };
    });

    if (!result.ok) {
      logger.error("Token 刷新失败", { status: result.status });
      return null;
    }

    const data = result.data;

    try {
      cookieStore.set(ACCESS_TOKEN_COOKIE, data.access_token, {
        ...TOKEN_COOKIE_OPTIONS,
        maxAge: data.expires_in,
      });

      cookieStore.set(REFRESH_TOKEN_COOKIE, data.refresh_token, {
        ...TOKEN_COOKIE_OPTIONS,
        maxAge: 60 * 60 * 24 * 7,
      });
    } catch {
      // Server Component 上下文（非 Server Action / Route Handler）无法修改 cookie
      // 后端 rotation 已撤销旧 refresh_token，新 token 仅内存有效用于本次请求重试
      // 浏览器仍持旧 refresh_token（已失效），下次请求触发刷新会失败并被 Route Handler 清 cookie
      // 此为 Next.js Server Component 已知限制，由 Proxy 层（HTML 请求）或 Server Action 上下文兜底
      logger.error(
        "Server Component 上下文无法写入 cookie：新 token 仅本次内存有效，浏览器下次请求将触发登出",
        {
          hint: "确保此 Server Component 改为 Server Action，或由 Proxy 层提前刷新 HTML 请求的 token",
        },
      );
    }

    return data;
  } catch (error) {
    logger.error("刷新 Token 时发生网络错误", error);
    return null;
  }
}

/**
 * 获取当前有效的 access_token
 * 优先读取 cookie，不命中时尝试 refresh_token 换新
 */
export async function getValidAccessToken(): Promise<string | null> {
  const cookieToken = await getAccessTokenFromCookie();
  if (cookieToken) return cookieToken;

  const result = await refreshTokenServer();
  return result?.access_token ?? null;
}

/**
 * 忽略 cookie 中的 access_token，强制用 refresh_token 换取新 token
 * 用于 401 后的重试场景
 */
export async function forceRefreshToken(): Promise<string | null> {
  const result = await refreshTokenServer();
  return result?.access_token ?? null;
}
