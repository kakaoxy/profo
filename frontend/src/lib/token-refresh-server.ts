/**
 * 服务端Token刷新管理器
 * 每个请求独立读取自己的 cookie，不跨用户共享 token
 */

import { cookies } from "next/headers";
import { logger } from "./logger";

interface RefreshResult {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

/**
 * 从 Cookie 中读取 access_token
 * 每次请求独立读取，不使用全局缓存避免跨用户串号
 */
export async function getAccessTokenFromCookie(): Promise<string | null> {
  try {
    const cookieStore = await cookies();
    return cookieStore.get("access_token")?.value ?? null;
  } catch {
    return null;
  }
}

/**
 * 服务端Token刷新函数
 * 使用当前请求的 refresh_token cookie 向 /auth/refresh 换取新的 token pair
 * 不缓存结果，每次调用独立读取 cookie 并刷新
 */
export async function refreshTokenServer(): Promise<RefreshResult | null> {
  try {
    const cookieStore = await cookies();
    const refreshToken = cookieStore.get("refresh_token")?.value;

    if (!refreshToken) {
      logger.warn("无 refresh_token，无法刷新");
      return null;
    }

    // 动态导入避免循环依赖
    const { apiPaths, getApiUrl } = await import("./config");

    const response = await fetch(getApiUrl(apiPaths.auth.refresh), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });

    if (!response.ok) {
      logger.error("Token 刷新失败", { status: response.status });
      return null;
    }

    const data: RefreshResult = await response.json();

    try {
      cookieStore.set("access_token", data.access_token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: data.expires_in,
        sameSite: "lax",
      });

      cookieStore.set("refresh_token", data.refresh_token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 60 * 60 * 24 * 7,
        sameSite: "lax",
      });
    } catch {
      // Proxy 层（proxy.ts）已是 cookie 更新的主要路径
      // Server Component 上下文中无法修改 cookie（仅 Server Action / Route Handler 可写）
      logger.warn("Server Component 无法写入 cookie，由 Proxy 层处理 cookie 更新");
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
