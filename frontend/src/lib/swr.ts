import { refreshBrowserSession } from "@/lib/api/create-api-client";
import { resolveAuthEndpoints } from "@/lib/api/session-identity";

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
    const { success: refreshed, retryable } = await refreshBrowserSession(
      () => resolveAuthEndpoints().refreshEndpoint,
    );
    if (refreshed) {
      const retryRes = await fetch(url, { credentials: "include" });
      if (retryRes.status === 401 || retryRes.status === 403) throw new AuthError();
      if (!retryRes.ok) {
        const error = await retryRes.json().catch(() => ({ message: "请求失败" }));
        throw new Error(error.message || `HTTP ${retryRes.status}`);
      }
      return retryRes.json();
    }
    if (retryable) {
      // 瞬时失败：会话仍有效，抛可重试网络错误而非 AuthError（避免被当未登录处理）
      throw new Error("服务暂时不可用，请稍后重试");
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
