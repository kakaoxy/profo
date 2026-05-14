// src/lib/api-server.ts
import createClient from "openapi-fetch";
import type { paths } from "./api-types";
import { getApiUrl } from "./config";
import { getAccessTokenFromCookie, refreshTokenServer } from "./token-refresh-server";
import { redirect } from "next/navigation";

/**
 * 仅限服务端组件 (Server Components) 和 Server Actions 使用
 * 每个请求独立从 httpOnly cookie 读取 access_token，消除并发竞态。
 *
 * 注意：不缓存 token 在闭包中，避免多请求共享可变状态。
 */
/** 最大重试次数，防止极端情况下反复刷新 */
const MAX_RETRIES = 1;

export async function fetchClient() {
  const fetchWithAutoRefresh: typeof fetch = async (input, init) => {
    const makeRequest = async (bearerToken: string | null) => {
      const requestHeaders =
        input instanceof Request
          ? Object.fromEntries(input.headers.entries())
          : {};

      return fetch(input, {
        ...init,
        headers: {
          ...requestHeaders,
          ...init?.headers,
          ...(bearerToken ? { Authorization: `Bearer ${bearerToken}` } : {}),
        },
      });
    };

    let token = await getAccessTokenFromCookie();
    let retries = 0;

    while (retries <= MAX_RETRIES) {
      const response = await makeRequest(token);

      if (response.status !== 401) {
        return response;
      }

      if (retries >= MAX_RETRIES) {
        return response;
      }

      retries++;
      console.log(`🔁 [Server] 检测到 401，尝试刷新 Token... (第 ${retries} 次)`);

      const result = await refreshTokenServer();

      if (!result?.access_token) {
        console.error("🔁 [Server] Token 刷新失败，跳转登录页");
        redirect("/login");
      }

      token = result.access_token;
    }

    // 理论上不会到达这里，但 TypeScript 需要返回值
    return makeRequest(token);
  };

  return createClient<paths>({
    baseUrl: getApiUrl(""),
    fetch: fetchWithAutoRefresh,
  });
}
