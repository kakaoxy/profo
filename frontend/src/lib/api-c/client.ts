import createClient, { type Middleware } from "openapi-fetch";
import type { paths } from "../api-types";
import { getClientApiUrl } from "../config";

let refreshPromise: Promise<boolean> | null = null;

function tryRefreshTokenClient(): Promise<boolean> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async (): Promise<boolean> => {
    try {
      const response = await fetch("/api/auth/c/refresh", {
        method: "POST",
        credentials: "include",
      });

      if (!response.ok) {
        return false;
      }

      return true;
    } catch {
      return false;
    } finally {
      setTimeout(() => {
        refreshPromise = null;
      }, 0);
    }
  })();

  return refreshPromise;
}

const credentialsMiddleware: Middleware = {
  async onRequest({ request }) {
    return new Request(request, {
      credentials: "include",
      signal: request.signal,
    });
  },
};

const authMiddleware: Middleware = {
  async onResponse({ response, request }) {
    if (response.status === 401) {
      const url = response.url;

      if (url.includes("/auth/c/refresh")) {
        return response;
      }

      const refreshed = await tryRefreshTokenClient();

      if (refreshed) {
        await new Promise(resolve => setTimeout(resolve, 100));

        let body: BodyInit | null = null;
        if (request.body) {
          body = await request.clone().text();
        }

        return await fetch(request.url, {
          method: request.method,
          headers: request.headers,
          body,
          credentials: "include",
          mode: request.mode,
          cache: request.cache,
          signal: request.signal,
        });
      }

      if (typeof window !== "undefined" && !window.location.pathname.includes("/c/login")) {
        window.location.href = `/c/login?redirect=${encodeURIComponent(window.location.pathname)}`;
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
