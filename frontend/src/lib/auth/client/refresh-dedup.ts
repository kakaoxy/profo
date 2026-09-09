/**
 * Shared refresh-token dedup registry.
 *
 * 之前 `lib/api-c/client.ts` 与 `lib/api-client.ts` 各自维护独立的
 * `refreshPromise` 单例，跨文件无去重——C 端页面两套 client 同时触发 401
 * 时会发起两次刷新请求。本模块以 refresh endpoint 为 key 做全局去重，
 * 同一 endpoint 的并发刷新只发一次请求。
 *
 * 缓存窗口：Promise 完成后保留 2 秒，用于合并并发突发，随后清除。
 *
 * [安全修复] Token 不再返回给客户端 JS，刷新后依赖 httpOnly cookie 自动携带。
 *
 * [会话修复] retryable 语义：refresh 路由对后端明确拒绝（401/403）返回 401，
 * 对瞬时失败（5xx/网络/超时）返回 503 且保留 cookie。retryable=true 表示会话
 * 仍有效，调用方不应登出，仅按可重试错误处理。
 */

export interface RefreshResult {
  /** 刷新是否成功。 */
  success: boolean;
  /** 瞬时失败（refresh 路由 503 / 网络异常）：会话仍有效，调用方不应登出，仅按可重试错误处理。 */
  retryable: boolean;
}

const refreshPromises = new Map<string, Promise<RefreshResult>>();

const CACHE_WINDOW_MS = 2000;

/**
 * 调用指定 refresh endpoint，同一 endpoint 的并发调用共享同一 Promise。
 *
 * @param endpoint - 刷新路由路径，如 `/api/auth/c/refresh` 或 `/api/auth/refresh`
 * @returns 刷新结果（仅 success 布尔值，token 由 httpOnly cookie 自动写入）
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
      if (response.status === 503) {
        // 路由层约定的瞬时失败语义：保留 cookie 可重试
        return { success: false, retryable: true };
      }
      if (!response.ok) {
        // 路由契约：401=后端明确拒绝（确定性失效，可登出）；其余非 2xx
        // （含意外 500/502）不证明 refresh_token 失效，按可重试处理，
        // 避免误清仍有效的 7 天会话
        return { success: false, retryable: response.status !== 401 };
      }
      return { success: true, retryable: false };
    } catch {
      // 网络异常（Next.js 服务器不可达）：视作可重试，不触发登出
      return { success: false, retryable: true };
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
