import createClient, { type Middleware } from "openapi-fetch";
import type { paths } from "./api-types";
import { getClientApiUrl } from "./config";

// 全局单例刷新 Promise，防止并发刷新导致 refresh token 被多次使用
let refreshPromise: Promise<string | null> | null = null;

export function tryRefreshTokenClient(): Promise<string | null> {
  if (refreshPromise) return refreshPromise;

  const promise = (async (): Promise<string | null> => {
    try {
      const isCRoute = typeof window !== "undefined" && window.location.pathname.startsWith("/c");
      const refreshPath = isCRoute ? "/api/auth/c/refresh" : "/api/auth/refresh";

      const response = await fetch(refreshPath, {
        method: "POST",
        credentials: "include",
      });

      if (!response.ok) {
        return null;
      }

      const data = await response.json();
      return data.access_token ?? null;
    } catch {
      return null;
    }
  })();

  refreshPromise = promise;

  promise.finally(() => {
    setTimeout(() => {
      if (refreshPromise === promise) {
        refreshPromise = null;
      }
    }, 2000);
  });

  return promise;
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

      const newToken = await tryRefreshTokenClient();

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
        const isCRoute = window.location.pathname.startsWith("/c");
        const loginPath = isCRoute ? "/c/login" : "/login";
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
