import { refreshTokensDedup } from "@/lib/auth/client/refresh-dedup";

function getRefreshEndpoint(): string {
  const isAdminRoute = typeof window !== "undefined" && window.location.pathname.startsWith("/admin");
  return isAdminRoute ? "/api/auth/refresh" : "/api/auth/c/refresh";
}

export class AuthError extends Error {
  constructor() {
    super("AUTH_REQUIRED");
    this.name = "AuthError";
  }
}

export class ForbiddenError extends Error {
  constructor() {
    super("FORBIDDEN");
    this.name = "ForbiddenError";
  }
}

export async function fetcher<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: "include" });
  if (res.status === 401) {
    const { success: refreshed } = await refreshTokensDedup(getRefreshEndpoint());
    if (refreshed) {
      const retryRes = await fetch(url, { credentials: "include" });
      if (retryRes.status === 401 || retryRes.status === 403) throw new AuthError();
      if (!retryRes.ok) {
        const error = await retryRes.json().catch(() => ({ message: "请求失败" }));
        throw new Error(error.message || `HTTP ${retryRes.status}`);
      }
      return retryRes.json();
    }
    throw new AuthError();
  }
  if (res.status === 403) throw new ForbiddenError();
  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: "请求失败" }));
    throw new Error(error.message || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function publicFetcher<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: "请求失败" }));
    throw new Error(error.message || `HTTP ${res.status}`);
  }
  return res.json();
}
