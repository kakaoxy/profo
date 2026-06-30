import createClient, { type Middleware } from "openapi-fetch";
import type { paths } from "../api-types";
import { getClientApiUrl } from "../config";
import { refreshTokensDedup } from "@/lib/auth/client/refresh-dedup";

const C_REFRESH_ENDPOINT = "/api/auth/c/refresh";

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

      if (url.includes("/auth/c/refresh")) {
        return response;
      }

      const { success: refreshed } = await refreshTokensDedup(C_REFRESH_ENDPOINT);

      if (refreshed) {
        await new Promise(resolve => setTimeout(resolve, 100));

        const storedBody = requestBodyStore.get(request);
        requestBodyStore.delete(request);

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
