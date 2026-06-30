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

const refreshPromises = new Map<string, Promise<unknown>>();

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
export function dedupServerRefresh<T>(
  key: string,
  refreshFn: () => Promise<T>,
): Promise<T> {
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
