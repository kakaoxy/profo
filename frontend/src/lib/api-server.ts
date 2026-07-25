// src/lib/api-server.ts
import { cache } from "react";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { logger } from "@/lib/logger";
import createClient from "openapi-fetch";
import type { paths } from "./api-types";
import { getApiUrl } from "./config";
import { getAccessTokenFromCookie, forceRefreshToken } from "./token-refresh-server";

/**
 * 仅限服务端组件 (Server Components) 和 Server Actions 使用
 * 每个请求独立从 httpOnly cookie 读取 access_token，消除并发竞态。
 *
 * Task 8.1: 401 处理按上下文分流：
 *  - **Server Action 上下文**（请求头含 `next-action`）：仍走 `forceRefreshToken`
 *    在内存刷新并重试。Server Action 可写 cookie（Next.js 16 允许），刷新后
 *    `setTokenCookies` 正常落盘，重试可成功。
 *  - **Server Component 上下文**（无 `next-action` 头）：不能写 cookie，
 *    走 `forceRefreshToken` 会导致后端 rotation 撤销旧 refresh_token 但新 token
 *    无法落盘，浏览器下次请求仍带已撤销的 refresh_token 触发登出。因此改为
 *    `redirect("/api/auth/refresh?next=<path>")` —— Route Handler 可写 cookie，
 *    刷新成功后 303 重定向回 `<path>`，Server Component 重新渲染时拿到新 token。
 *
 * 使用 React.cache() 包裹：同一请求内多次调用复用同一 client 实例，
 * 避免重复创建闭包。token 在首次请求时从 cookie 读取，401 重试时通过
 * forceRefreshToken 刷新（Server Action 上下文）或 redirect（Server Component 上下文）。
 * 规则: server-cache-react
 */
/** 最大重试次数，防止极端情况下反复刷新 */
const MAX_RETRIES = 1;

/**
 * 检测当前请求是否为 Server Action 调用。
 *
 * Next.js 通过 `Next-Action` 头标识 Server Action POST 请求；
 * Server Component 渲染（GET 或 RSC 导航）不带此头。
 * 检测失败时保守返回 `true`（按 Server Action 处理），保留旧的
 * `forceRefreshToken` 行为，避免误重定向破坏现有 Server Action 流程。
 */
async function isServerActionRequest(): Promise<boolean> {
  try {
    const headersList = await headers();
    return headersList.has("next-action");
  } catch {
    // headers() 不可用（如单元测试未 mock）—— 保守按 Server Action 处理
    return true;
  }
}

/**
 * 读取当前请求路径，用于构造 `?next=<path>` 重定向参数。
 *
 * Task 8.1: `x-pathname` 由 `proxy.ts` 注入（Next.js 16 已移除自动
 * `x-invoke-path`/`x-pathname`）。读不到时回退到 `/admin`（admin home）。
 */
async function getCurrentPathname(): Promise<string> {
  try {
    const headersList = await headers();
    return headersList.get("x-pathname") ?? "/admin";
  } catch {
    return "/admin";
  }
}

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

      // Task 8.1: Server Component 上下文无法写 cookie，必须走 /api/auth/refresh
      // Route Handler 才能落盘新 token。这里在调用 forceRefreshToken 之前
      // 检测上下文，避免后端 rotation 撤销旧 refresh_token 后无法落盘新 token。
      const isServerAction = await isServerActionRequest();
      if (!isServerAction) {
        const pathname = await getCurrentPathname();
        const refreshUrl = `/api/auth/refresh?next=${encodeURIComponent(pathname)}`;
        logger.info(
          `Server Component 401 — redirect to ${refreshUrl} (Route Handler 写 cookie 后回跳)`,
        );
        // redirect() 抛 NEXT_REDIRECT，由 Next.js 渲染层捕获并执行 303 跳转。
        // 调用方（Server Component）的 try/catch / Promise.allSettled 需放行
        // 该错误（参见 layout.tsx / dashboard-data.ts 中的 isRedirectError 守卫）。
        redirect(refreshUrl);
      }

      // Server Action 上下文：forceRefreshToken 内部走 adminAuth.adapter.refreshToken
      // + setTokenCookies，Server Action 可写 cookie，刷新可正常落盘。
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
