// src/lib/api-server.ts
import { cache } from "react";
import { logger } from "@/lib/logger";
import createClient from "openapi-fetch";
import type { paths } from "./api-types";
import { getApiUrl } from "./config";
import { getAccessTokenFromCookie, forceRefreshToken } from "./token-refresh-server";

/**
 * 仅限服务端组件 (Server Components) 和 Server Actions 使用
 * 每个请求独立从 httpOnly cookie 读取 access_token，消除并发竞态。
 *
 * 首次从 cookie 读取 access_token，401 时调用 forceRefreshToken 向后端刷新，保留重试一次作为兜底。
 *
 * 使用 React.cache() 包裹：同一请求内多次调用复用同一 client 实例，
 * 避免重复创建闭包。token 在首次请求时从 cookie 读取，401 重试时通过 forceRefreshToken 刷新。
 * 规则: server-cache-react
 */
/** 最大重试次数，防止极端情况下反复刷新 */
const MAX_RETRIES = 1;

async function createServerClient() {
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
      logger.warn(`检测到 401，刷新 token 重试 (第 ${retries} 次)`);

      // 调用 forceRefreshToken 向后端刷新 access_token
      token = await forceRefreshToken();

      if (!token) {
        // 刷新失败，返回原 401 响应由上层处理
        return response;
      }
    }

    // 理论上不会到达这里，但 TypeScript 需要返回值
    return makeRequest(token);
  };

  return createClient<paths>({
    baseUrl: getApiUrl(""),
    fetch: fetchWithAutoRefresh,
  });
}

/**
 * 对外暴露的缓存版 client。
 * React.cache() 保证同一请求内多次调用返回同一实例，避免重复创建闭包。
 */
export const fetchClient = cache(createServerClient);
