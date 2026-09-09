/**
 * Server-side refresh-token dedup registry.
 *
 * Refresh token rotation revokes the old refresh_token on each successful
 * refresh. Without dedup, concurrent requests sharing the same refresh_token
 * (e.g. page navigation + Next.js prefetch RSC requests) each fire an
 * independent refresh call — all but the first fail because the old token is
 * already revoked, causing spurious redirects to the login page and cookie
 * clearing.
 *
 * This module ensures concurrent refresh attempts for the same refresh_token
 * share a single in-flight Promise, mirroring the client-side
 * `lib/auth/client/refresh-dedup.ts` approach.
 *
 * Cache window: the entry is retained for {@link CACHE_WINDOW_MS} after the
 * Promise settles to coalesce burst traffic, then evicted.
 */

/**
 * 去重注册表挂在 globalThis 上：dev 模式（Turbopack）每个请求可能重新实例化
 * 模块，模块级 Map 会随之丢失，导致跨请求去重失效；globalThis 在同一服务进程
 * 内持久，保证 dev 与生产行为一致。
 */
const globalRegistry = globalThis as unknown as {
  __authServerRefreshPromises?: Map<string, Promise<unknown>>;
};
const refreshPromises: Map<string, Promise<unknown>> =
  (globalRegistry.__authServerRefreshPromises ??= new Map());

const CACHE_WINDOW_MS = 2000;

/**
 * Deduplicates concurrent refresh calls keyed by `key` (typically the raw
 * refresh_token or a short hash of it).
 *
 * @param key - Dedup key, should uniquely identify the refresh token.
 * @param refreshFn - The async refresh operation to run (at most once per key).
 * @returns The shared Promise — all concurrent callers for the same key
 *          receive the same result (or rejection).
 */
export function dedupServerRefresh<T>(key: string, refreshFn: () => Promise<T>): Promise<T> {
  const existing = refreshPromises.get(key);
  if (existing) {
    return existing as Promise<T>;
  }

  const promise = refreshFn();
  refreshPromises.set(key, promise);

  // Schedule cleanup after the cache window, regardless of success/failure.
  // Using .then(onFulfilled, onRejected) avoids an unhandled rejection from
  // a floating .finally() Promise when refreshFn rejects.
  const cleanup = () => {
    setTimeout(() => {
      if (refreshPromises.get(key) === promise) {
        refreshPromises.delete(key);
      }
    }, CACHE_WINDOW_MS);
  };
  promise.then(cleanup, cleanup);

  return promise;
}
