import createClient, { type Middleware } from "openapi-fetch";
import type { paths } from "../api-types";
import { getClientApiUrl } from "../config";

let refreshPromise: Promise<boolean> | null = null;

function tryRefreshTokenClient(): Promise<boolean> {
  if (refreshPromise) return refreshPromise;

  const promise = (async (): Promise<boolean> => {
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

      if (url.includes("/auth/c/refresh")) {
        return response;
      }

      const refreshed = await tryRefreshTokenClient();

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
