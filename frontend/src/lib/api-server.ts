// src/lib/api-server.ts
import { cache } from "react";
import { logger } from "@/lib/logger";
import createClient from "openapi-fetch";
import type { paths } from "./api-types";
import { getApiUrl } from "./config";
import { getAccessTokenFromCookie } from "./token-refresh-server";
import { redirect } from "next/navigation";

/**
 * 仅限服务端组件 (Server Components) 和 Server Actions 使用
 * 每个请求独立从 httpOnly cookie 读取 access_token，消除并发竞态。
 *
 * Proxy 层（proxy.ts）已保证 cookie 中 token 有效，
 * 此处仅从 cookie 读取，保留 401 重试一次作为兜底。
 *
 * 使用 React.cache() 包裹：同一请求内多次调用复用同一 client 实例，
 * 避免重复创建闭包。token 仍在每次 fetch 调用时从 cookie 现读，无安全影响。
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
      logger.warn(`检测到 401，重新读取 cookie token (第 ${retries} 次)`);

      // Proxy 层已保证 cookie 有效，重新从 cookie 读取 token
      token = await getAccessTokenFromCookie();

      if (!token) {
        logger.error("Cookie 中无有效 token，跳转登录页");
        redirect("/admin/login");
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
