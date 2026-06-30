/**
 * Shared refresh-token dedup registry.
 *
 * 之前 `lib/api-c/client.ts` 与 `lib/api-client.ts` 各自维护独立的
 * `refreshPromise` 单例，跨文件无去重——C 端页面两套 client 同时触发 401
 * 时会发起两次刷新请求。本模块以 refresh endpoint 为 key 做全局去重，
 * 同一 endpoint 的并发刷新只发一次请求。
 *
 * 缓存窗口：Promise 完成后保留 2 秒，用于合并并发突发，随后清除。
 */

export interface RefreshResult {
  /** 刷新是否成功。 */
  success: boolean;
  /** 新的 access_token（成功时）；失败时为 null。 */
  accessToken: string | null;
}

const refreshPromises = new Map<string, Promise<RefreshResult>>();

const CACHE_WINDOW_MS = 2000;

/**
 * 调用指定 refresh endpoint，同一 endpoint 的并发调用共享同一 Promise。
 *
 * @param endpoint - 刷新路由路径，如 `/api/auth/c/refresh` 或 `/api/auth/refresh`
 * @returns 刷新结果（success + 新 access_token）
 */
export function refreshTokensDedup(endpoint: string): Promise<RefreshResult> {
  const existing = refreshPromises.get(endpoint);
  if (existing) return existing;

  const promise = (async (): Promise<RefreshResult> => {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        credentials: "include",
      });
      if (!response.ok) {
        return { success: false, accessToken: null };
      }
      const data = await response.json();
      return { success: true, accessToken: data.access_token ?? null };
    } catch {
      return { success: false, accessToken: null };
    }
  })();

  refreshPromises.set(endpoint, promise);

  promise.finally(() => {
    setTimeout(() => {
      if (refreshPromises.get(endpoint) === promise) {
        refreshPromises.delete(endpoint);
      }
    }, CACHE_WINDOW_MS);
  });

  return promise;
}
