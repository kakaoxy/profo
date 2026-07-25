/**
 * 服务端 Token 刷新管理器
 * 每个请求独立读取自己的 cookie，不跨用户共享 token
 *
 * 内部通过 `adminAuth.adapter.refreshToken` 调用后端 `/api/v1/auth/refresh`，
 * 通过 `setTokenCookies(adminAuth.config)` 写入 cookie（maxAge 从 exp claim 读取，
 * 不再使用 `data.expires_in` 硬编码）。并发刷新通过 `dedupServerRefresh` 去重：
 * refresh_token rotation 每次撤销旧 jti，不去重会导致并发请求中除第一个外全部失败。
 *
 * Task 7.3 评估结论：本模块不可整体删除。`api-server.ts` 的 `fetchWithAutoRefresh`
 * 依赖 `getAccessTokenFromCookie` / `forceRefreshToken` 进行 401 重试。auth 库的
 * `createMiddleware` 适合在 proxy 层使用（操作 NextRequest/NextResponse），但
 * Server Component 内的 fetch 重试需要更细粒度的控制（只返回新 access_token，
 * 不操作 NextResponse），因此保留此模块作为 api-server 与 adminAuth adapter
 * 之间的薄封装。
 *
 * Task 8.3: 移除「Server Component 无法写 cookie」的内存 token 兜底逻辑。
 * 此前在 Server Component 上下文调用 `setTokenCookies` 会抛错，旧代码 catch
 * 后仍返回新 access_token 给本次请求重试，但后端 rotation 已撤销旧 refresh_token，
 * 浏览器下次请求会因 cookie 中 refresh_token 失效而被登出 —— 即「内存 token」
 * 仅本次请求有效，无法持久化。
 *
 * 新流程：`api-server.ts` 在调用 `forceRefreshToken` 之前通过 `next-action`
 * 请求头检测上下文，Server Component 上下文直接 `redirect("/api/auth/refresh?next=...")`
 * 由 Route Handler 落盘 cookie；只有 Server Action 上下文（可写 cookie）才走本模块。
 * 因此本模块的 `setTokenCookies` 调用应当总是成功，若失败则交由外层 catch
 * 返回 `null`，由调用方（api-server.ts）返回原 401 响应由上层处理。
 */

import { adminAuth } from "@/admin-auth";
import { dedupServerRefresh } from "@/lib/auth/server/refresh-dedup";
import { setTokenCookies } from "@/lib/auth/core";
import { logger } from "@/lib/logger";
import { cookies } from "next/headers";

/** Access Token cookie 名（Admin 端，无前缀，与 adminAuth.config.cookieNames.accessToken 一致） */
const ACCESS_TOKEN_COOKIE = "access_token";
/** Refresh Token cookie 名（Admin 端，无前缀，与 adminAuth.config.cookieNames.refreshToken 一致） */
const REFRESH_TOKEN_COOKIE = "refresh_token";

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
 * 服务端 Token 刷新函数
 *
 * 使用当前请求的 refresh_token cookie，通过 `adminAuth.adapter.refreshToken`
 * 向后端 `/auth/refresh` 换取新的 token pair，再用 `setTokenCookies` 写入 cookie
 * （maxAge 从 token exp claim 读取）。
 *
 * 通过 `dedupServerRefresh` 以 refresh_token 为 key 去重：同一 refresh_token 在
 * 2 秒内的多次调用共享同一 Promise，避免并发触发后端 rotation 导致后续请求失败。
 *
 * Task 8.3: 仅在 Server Action / Route Handler 上下文调用（可写 cookie）。
 * Server Component 上下文应由 `api-server.ts` 重定向到 `/api/auth/refresh` 路由
 * 处理，不应调用本函数 —— 后端 rotation 撤销旧 refresh_token 后无法落盘新 token，
 * 会导致浏览器下次请求被登出。
 *
 * @returns `{ accessToken }` 或 `null`（刷新失败/无 refresh_token/cookie 写入失败）
 */
export async function refreshTokenServer(): Promise<{ accessToken: string } | null> {
  try {
    const cookieStore = await cookies();
    const refreshToken = cookieStore.get(REFRESH_TOKEN_COOKIE)?.value;

    if (!refreshToken) {
      logger.warn("无 refresh_token，无法刷新");
      return null;
    }

    // 以 refresh_token 为 key 去重，防止并发刷新触发 rotation 竞态。
    // adminAuth.adapter.refreshToken 返回 TokenPair 或抛错（错误信息由 extractApiError 提取）。
    const tokens = await dedupServerRefresh(refreshToken, () =>
      adminAuth.adapter.refreshToken(refreshToken),
    );

    // setTokenCookies 从 token exp claim 计算 maxAge，不再依赖 expires_in 字段。
    // 仅在 Server Action / Route Handler 上下文可写 cookie；若在 Server Component
    // 上下文调用会抛错，由外层 catch 捕获并返回 null（Task 8.3：不再保留内存 token）。
    // 调用方（api-server.ts）应通过 `next-action` 头检测上下文，Server Component
    // 上下文走 /api/auth/refresh 路由而非本函数。
    await setTokenCookies(tokens, adminAuth.config);

    return { accessToken: tokens.accessToken };
  } catch (error) {
    // adminAuth.adapter.refreshToken 抛错（HTTP 非 2xx 或网络错误），
    // 或 setTokenCookies 在不可写 cookie 的上下文调用抛错。
    // 返回 null 由调用方（api-server.ts）返回原 401 响应由上层处理。
    logger.error("Token 刷新失败", error);
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
  return result?.accessToken ?? null;
}

/**
 * 忽略 cookie 中的 access_token，强制用 refresh_token 换取新 token
 * 用于 401 后的重试场景
 */
export async function forceRefreshToken(): Promise<string | null> {
  const result = await refreshTokenServer();
  return result?.accessToken ?? null;
}
