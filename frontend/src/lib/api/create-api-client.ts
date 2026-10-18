/**
 * 浏览器端 API 客户端工厂（openapi-fetch + 统一 401 刷新/重试/跳登录）。
 *
 * 合并了原先三处重复实现（spec §2.2 F1/F2）：
 * - `lib/api-client.ts`（admin 语义，靠 pathname 嗅探）
 * - `lib/api-c/client.ts`（C 端语义，已被 `createApiClient` + 身份登记取代）
 * - `lib/swr.ts` 的 `fetcher` 401 分流（改为调用本模块 `refreshBrowserSession`）
 *
 * 设计要点（D9）：
 * - **显式配置**：刷新端点与登录页由调用方解析器提供，工厂内部零 pathname 嗅探；
 * - 解析器在 401 发生时求值（不是创建时），因此 `client` 可以是模块级单例，
 *   由路由组登记的会话身份决定实际端点；
 * - 并发 401 去重由 `refreshTokensDedup`（按 endpoint 全局去重）承担；
 * - `retryable`（刷新路由 503/网络抖动）不跳登录页，返回原响应交页面错误态；
 * - 重试时用 `request-body-store` 缓存重放请求体（POST/PUT 不丢 body）。
 */

import createClient, { type Client, type Middleware } from "openapi-fetch";

import { refreshTokensDedup, type RefreshResult } from "@/lib/auth/client/refresh-dedup";
import { consumeRequestBody, storeRequestBody } from "@/lib/request-body-store";

import type { paths } from "../api-types";
import { getClientApiUrl } from "../config";

export interface ApiClientAuthResolvers {
  /** 解析刷新端点（401 时求值） */
  refreshEndpoint: () => string;
  /** 解析登录页路径（会话确定性失效时求值） */
  loginPath: () => string;
}

export interface CreateApiClientOptions extends ApiClientAuthResolvers {
  /** 客户端 baseUrl（浏览器端默认相对路径，经 Next rewrites/Nginx 代理） */
  baseUrl?: string;
}

/** 登录页判定：已在登录页时不再跳转，避免 next 参数自引用循环 */
function isOnLoginPage(pathname: string): boolean {
  return pathname.includes("/login");
}

/** 会话确定性失效 → 整页跳转登录页（fetch 拦截器内无法使用 useRouter/redirect） */
function redirectToLogin(loginPath: string): void {
  if (typeof window === "undefined") return;
  const { pathname } = window.location;
  if (isOnLoginPage(pathname)) return;
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.href = `${loginPath}?redirect=${encodeURIComponent(pathname)}`;
}

/**
 * 浏览器端刷新会话（SWR fetcher 与 openapi-fetch 中间件共用的唯一实现）。
 *
 * @param refreshEndpoint - 刷新端点解析器（401 时求值，读取路由组登记的身份）
 */
export function refreshBrowserSession(refreshEndpoint: () => string): Promise<RefreshResult> {
  return refreshTokensDedup(refreshEndpoint());
}

const credentialsMiddleware: Middleware = {
  async onRequest({ request }) {
    const headers = new Headers(request.headers);
    headers.set("X-Requested-With", "XMLHttpRequest");
    return new Request(request, {
      credentials: "include",
      headers,
      signal: request.signal,
    });
  },
};

function createAuthMiddleware(resolvers: ApiClientAuthResolvers): Middleware {
  return {
    async onRequest({ request }) {
      // 401 重试需要重放 body：先缓存请求体文本
      if (request.body) {
        const cloned = request.clone();
        storeRequestBody(request, await cloned.text());
      }
      return request;
    },

    async onResponse({ response, request }) {
      if (response.status !== 401) return response;

      const refreshEndpoint = resolvers.refreshEndpoint();
      // 刷新端点自身 401 = 刷新失败，不再递归刷新
      if (response.url.includes(refreshEndpoint)) return response;

      const { success: refreshed, retryable } = await refreshBrowserSession(
        resolvers.refreshEndpoint,
      );

      if (refreshed) {
        const storedBody = consumeRequestBody(request);
        const init: RequestInit = {
          credentials: "include",
          signal: request.signal,
        };
        if (storedBody !== undefined) {
          init.body = storedBody;
        }
        return await fetch(new Request(request, init));
      }

      // 瞬时失败（后端 5xx/网络抖动）：会话仍有效，不跳登录页，
      // 返回原响应交由页面错误态展示可重试错误
      if (retryable) return response;

      redirectToLogin(resolvers.loginPath());
      return response;
    },
  };
}

/**
 * 创建浏览器端 API 客户端。
 *
 * @param options - 刷新端点/登录页解析器 + 可选 baseUrl
 */
export function createApiClient(options: CreateApiClientOptions): Client<paths> {
  const apiClient = createClient<paths>({
    baseUrl: options.baseUrl ?? getClientApiUrl(""),
  });
  // 顺序固定：credentials 先注册，确保所有请求携带 httpOnly cookie
  apiClient.use(credentialsMiddleware);
  apiClient.use(createAuthMiddleware(options));
  return apiClient;
}
