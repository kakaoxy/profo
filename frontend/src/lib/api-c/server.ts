import { cookies } from "next/headers";
import { getApiUrl } from "../config";
import { auth } from "@/auth";
import {
  getTokensFromCookies,
  setTokenCookies,
  isTokenValid,
} from "@/lib/auth/core";
import type { TokenPair } from "@/lib/auth";

/**
 * 从 cookie 读取并按需刷新 C 端 access token。
 * - cookie 无 token → null
 * - access token 有效 → 返回原 token
 * - access token 过期但 refresh token 有效 → 调 adapter.refreshToken 刷新并写 cookie，返回新 token
 * - 都失效 → null（由调用方按 401 处理）
 */
async function getValidCToken(): Promise<string | null> {
  const config = auth.config;
  const tokens = await getTokensFromCookies(config);
  if (!tokens) return null;

  if (isTokenValid(tokens.accessToken)) {
    return tokens.accessToken;
  }

  if (!isTokenValid(tokens.refreshToken)) {
    return null;
  }

  try {
    const refreshed: TokenPair = await config.adapter.refreshToken(
      tokens.refreshToken,
    );
    await setTokenCookies(refreshed, config);
    return refreshed.accessToken;
  } catch {
    return null;
  }
}

/**
 * 带 401 自动刷新重试的 fetch，供 C 端 Server Action 统一调用后端受保护接口。
 * - 优先用 cookie 中的 access_token；过期则用 refresh_token 刷新
 * - 收到 401 时再刷新一次 token 并重试
 * - 刷新失败则返回 401 响应，由调用方判断是否提示"请登录"
 */
export async function cServerActionFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const token = await getValidCToken();

  const existingHeaders: Record<string, string> = {};
  if (init.headers instanceof Headers) {
    init.headers.forEach((value, key) => {
      existingHeaders[key] = value;
    });
  } else if (Array.isArray(init.headers)) {
    init.headers.forEach(([key, value]) => {
      existingHeaders[key] = value;
    });
  } else if (typeof init.headers === "object" && init.headers !== null) {
    Object.assign(existingHeaders, init.headers);
  }

  const makeRequest = (bearerToken: string | null) =>
    fetch(getApiUrl(path), {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...existingHeaders,
        ...(bearerToken ? { Authorization: `Bearer ${bearerToken}` } : {}),
      },
    });

  let response = await makeRequest(token);

  if (response.status === 401) {
    // 清掉旧 access token 后再次走刷新流程
    const cookieStore = await cookies();
    const config = auth.config;
    cookieStore.delete(config.cookieNames.accessToken);

    const refreshedToken = await getValidCToken();
    if (refreshedToken) {
      response = await makeRequest(refreshedToken);
    }
  }

  return response;
}
