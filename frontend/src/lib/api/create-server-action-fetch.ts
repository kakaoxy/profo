/**
 * 服务端 Server Action fetch 工厂（spec D12）.
 *
 * 从 `lib/api-c/server.ts` 抽出：cookie 读 token → 有效期判定 → 按需刷新并落盘 →
 * 401 时再刷新一次重试。**仅限 Server Action / Route Handler 上下文**（可写 cookie）。
 *
 * ⚠️ 不用于 Server Component：RSC 无法写 cookie，刷新会撤销旧 refresh_token 却落不了盘。
 * admin 侧的 RSC 语义（`redirect("/api/auth/refresh?next=…")` + NEXT_REDIRECT 守卫）
 * 仍保留在 `lib/api-server.ts`，不得并入本工厂（spec F3）。
 */

import { cookies } from "next/headers";

import type { TokenPair } from "@/lib/auth";
import { getTokensFromCookies, isTokenValid, setTokenCookies } from "@/lib/auth/core";
import type { ResolvedAuthConfig } from "@/lib/auth/types";

export interface ServerActionFetchOptions {
  /** 已解析的 Auth 配置（含 cookieNames / cookieOptions / adapter） */
  config: ResolvedAuthConfig;
  /** 后端 API 基础地址（如 http://127.0.0.1:8000），拼接 path 使用 */
  apiBase: string;
}

/**
 * 从 cookie 读取并按需刷新 access token。
 *
 * - cookie 无 token → null
 * - access token 有效 → 返回原 token
 * - access token 过期但 refresh token 有效 → 调 adapter.refreshToken 刷新并写 cookie
 * - 都失效 → null（由调用方按 401 处理）
 */
async function getValidAccessToken(options: ServerActionFetchOptions): Promise<string | null> {
  const { config } = options;
  const tokens = await getTokensFromCookies(config);
  if (!tokens) return null;

  if (isTokenValid(tokens.accessToken)) {
    return tokens.accessToken;
  }

  if (!isTokenValid(tokens.refreshToken)) {
    return null;
  }

  try {
    const refreshed: TokenPair = await config.adapter.refreshToken(tokens.refreshToken);
    await setTokenCookies(refreshed, config);
    return refreshed.accessToken;
  } catch {
    return null;
  }
}

/** 统一 header 归一化（Headers / 数组 / 普通对象 三种形态） */
function normalizeHeaders(headers: HeadersInit | undefined): Record<string, string> {
  const result: Record<string, string> = {};
  if (headers instanceof Headers) {
    headers.forEach((value, key) => {
      result[key] = value;
    });
  } else if (Array.isArray(headers)) {
    headers.forEach(([key, value]) => {
      result[key] = value;
    });
  } else if (typeof headers === "object" && headers !== null) {
    Object.assign(result, headers);
  }
  return result;
}

/**
 * 创建「带 401 自动刷新重试」的服务端 fetch。
 *
 * @param options - Auth 配置 + 后端基地址（尾斜杠会被归一化）
 * @returns `(path, init) => Promise<Response>`：路径拼到 apiBase 后发请求，
 *   401 时刷新一次 cookie 并重试；刷新失败返回 401 响应由调用方提示「请登录」。
 */
export function createServerActionFetch(
  options: ServerActionFetchOptions,
): (path: string, init?: RequestInit) => Promise<Response> {
  const { config, apiBase } = options;
  // 基地址去尾斜杠：调用方常用 ``getApiUrl("")``（返回 ``http://host/``），
  // 直接拼接会生成 ``http://host//api/v1/...`` → FastAPI 路由匹配失败返回 404
  // （Server Action 全部失败，且错误体是 {"detail":"Not Found"} 难以定位）。
  const normalizedBase = apiBase.replace(/\/+$/, "");

  const makeRequest = (path: string, init: RequestInit, bearerToken: string | null) =>
    fetch(`${normalizedBase}${path.startsWith("/") ? path : `/${path}`}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...normalizeHeaders(init.headers),
        ...(bearerToken ? { Authorization: `Bearer ${bearerToken}` } : {}),
      },
    });

  return async (path, init = {}) => {
    const token = await getValidAccessToken(options);
    let response = await makeRequest(path, init, token);

    if (response.status === 401) {
      // 清掉旧 access token 后再次走刷新流程
      const cookieStore = await cookies();
      cookieStore.delete(config.cookieNames.accessToken);

      const refreshedToken = await getValidAccessToken(options);
      if (refreshedToken) {
        response = await makeRequest(path, init, refreshedToken);
      }
    }

    return response;
  };
}
