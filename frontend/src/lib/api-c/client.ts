import createClient, { type Middleware } from "openapi-fetch";
import type { paths } from "../api-types";
import { getClientApiUrl } from "../config";
import { refreshTokensDedup } from "@/lib/auth/client/refresh-dedup";
import { storeRequestBody, consumeRequestBody } from "@/lib/request-body-store";

const C_REFRESH_ENDPOINT = "/api/auth/c/refresh";

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

const authMiddleware: Middleware = {
  async onRequest({ request }) {
    if (request.body) {
      const cloned = request.clone();
      const bodyText = await cloned.text();
      storeRequestBody(request, bodyText);
    }
    return request;
  },

  async onResponse({ response, request }) {
    if (response.status === 401) {
      const url = response.url;

      if (url.includes("/auth/c/refresh")) {
        return response;
      }

      const { success: refreshed } = await refreshTokensDedup(C_REFRESH_ENDPOINT);

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

      if (typeof window !== "undefined" && !window.location.pathname.includes("/login")) {
        // 会话过期需整页跳转登录页以重置前端状态；此处为 fetch 拦截器而非组件内路由，
        // useRouter()/redirect() 均不适用，故整页跳转（规则不适用）。
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.href = `/login?redirect=${encodeURIComponent(window.location.pathname)}`;
      }
    }
    return response;
  },
};

export const cClient = createClient<paths>({
  baseUrl: getClientApiUrl(""),
});

cClient.use(credentialsMiddleware);
cClient.use(authMiddleware);
