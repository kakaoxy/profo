import createClient, { type Middleware } from "openapi-fetch";
import type { paths } from "./api-types";
import { getClientApiUrl } from "./config";
import { refreshTokensDedup } from "@/lib/auth/client/refresh-dedup";

function getRefreshEndpoint(): string {
  const isAdminRoute = typeof window !== "undefined" && window.location.pathname.startsWith("/admin");
  return isAdminRoute ? "/api/auth/refresh" : "/api/auth/c/refresh";
}

/**
 * 触发 token 刷新，返回新的 access_token 或 null。
 * 跨文件共享去重（与 api-c/client.ts 共用同一 registry）。
 */
export function tryRefreshTokenClient(): Promise<string | null> {
  return refreshTokensDedup(getRefreshEndpoint()).then((r) => r.accessToken);
}

const requestBodyStore = new WeakMap<Request, string>();

const credentialsMiddleware: Middleware = {
  async onRequest({ request }) {
    return new Request(request, {
      credentials: "include",
      signal: request.signal,
    });
  },
};

const authMiddleware: Middleware = {
  async onRequest({ request }) {
    if (request.body) {
      const cloned = request.clone();
      const bodyText = await cloned.text();
      requestBodyStore.set(request, bodyText);
    }
    return request;
  },

  async onResponse({ response, request }) {
    if (response.status === 401) {
      const url = response.url;

      if (url.includes("/auth/refresh")) {
        return response;
      }

      const { accessToken: newToken } = await refreshTokensDedup(getRefreshEndpoint());

      if (newToken) {
        const storedBody = requestBodyStore.get(request);
        requestBodyStore.delete(request);

        const headers = new Headers(request.headers);
        headers.set("Authorization", `Bearer ${newToken}`);

        const init: RequestInit = {
          credentials: "include",
          signal: request.signal,
          headers,
        };
        if (storedBody !== undefined) {
          init.body = storedBody;
        }

        return await fetch(new Request(request, init));
      }

      if (typeof window !== "undefined") {
        const isAdminRoute = window.location.pathname.startsWith("/admin");
        const loginPath = isAdminRoute ? "/admin/login" : "/login";
        if (!window.location.pathname.includes("/login")) {
          window.location.href = `${loginPath}?redirect=${encodeURIComponent(
            window.location.pathname
          )}`;
        }
      }
    }
    return response;
  },
};

/**
 * 场景 A: 客户端组件 (Client Components) 使用
 *
 * [安全修复] 通过 credentialsMiddleware 确保所有请求携带 httpOnly Cookie
 */
export const client = createClient<paths>({
  baseUrl: getClientApiUrl(""),
});

// 注册中间件：credentials 中间件必须先注册，确保所有请求携带 cookie
client.use(credentialsMiddleware);
// 注册认证中间件，处理 401 刷新
client.use(authMiddleware);
