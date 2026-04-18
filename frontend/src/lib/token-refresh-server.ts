/**
 * 服务端Token刷新管理器
 * 解决并发刷新竞争问题和Token同步问题
 *
 * 使用全局缓存来跟踪刷新状态和结果
 */

import { cookies } from "next/headers";

interface RefreshResult {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  timestamp: number;
}

// 使用全局变量存储刷新状态和结果（在服务端跨请求共享）
declare global {
  var __tokenRefreshState: {
    isRefreshing: boolean;
    refreshPromise: Promise<RefreshResult | null> | null;
    lastResult: RefreshResult | null;
  };
}

// 初始化全局状态
if (!global.__tokenRefreshState) {
  global.__tokenRefreshState = {
    isRefreshing: false,
    refreshPromise: null,
    lastResult: null,
  };
}

const refreshState = global.__tokenRefreshState;

// Token有效期缓冲时间（毫秒），提前刷新
const TOKEN_REFRESH_BUFFER = 60 * 1000; // 1分钟

/**
 * 检查缓存的token是否仍然有效
 */
function isCachedTokenValid(): boolean {
  if (!refreshState.lastResult) return false;
  const elapsed = Date.now() - refreshState.lastResult.timestamp;
  const expiresInMs = refreshState.lastResult.expires_in * 1000;
  // 如果token还有效（考虑缓冲时间）
  return elapsed < expiresInMs - TOKEN_REFRESH_BUFFER;
}

/**
 * 服务端Token刷新函数
 * 使用全局锁防止并发刷新竞争
 */
export async function refreshTokenServer(): Promise<RefreshResult | null> {
  // 1. 如果有缓存的有效token，直接返回
  if (isCachedTokenValid()) {
    console.log("✅ [Server] 使用缓存的有效token");
    return refreshState.lastResult;
  }

  // 2. 如果正在刷新中，等待刷新结果
  if (refreshState.isRefreshing && refreshState.refreshPromise) {
    console.log("⏳ [Server] 等待正在进行的刷新...");
    return refreshState.refreshPromise;
  }

  // 3. 开始新的刷新流程
  refreshState.isRefreshing = true;

  refreshState.refreshPromise = (async (): Promise<RefreshResult | null> => {
    try {
      const cookieStore = await cookies();
      const refreshToken = cookieStore.get("refresh_token")?.value;

      if (!refreshToken) {
        console.warn("🔁 [Server] 无 refresh_token，无法刷新");
        return null;
      }

      // 动态导入避免循环依赖
      const { API_BASE_URL } = await import("./config");

      const response = await fetch(`${API_BASE_URL}/api/v1/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });

      if (!response.ok) {
        console.error("🔁 [Server] Token 刷新失败，状态码:", response.status);
        // 刷新失败，清除全局缓存
        refreshState.lastResult = null;
        return null;
      }

      const data: RefreshResult = await response.json();

      // 缓存刷新结果
      const result: RefreshResult = {
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        expires_in: data.expires_in,
        timestamp: Date.now(),
      };

      refreshState.lastResult = result;

      console.log("✅ [Server] 成功刷新并缓存 access_token");
      return result;
    } catch (error) {
      console.error("🔁 [Server] 刷新 Token 时发生网络错误:", error);
      refreshState.lastResult = null;
      return null;
    } finally {
      refreshState.isRefreshing = false;
      // 延迟清除promise，让其他等待的请求能获取结果
      setTimeout(() => {
        refreshState.refreshPromise = null;
      }, 100);
    }
  })();

  return refreshState.refreshPromise;
}

/**
 * 获取当前有效的access_token
 * 优先使用缓存，必要时刷新
 */
export async function getValidAccessToken(): Promise<string | null> {
  // 首先检查缓存
  if (isCachedTokenValid()) {
    return refreshState.lastResult!.access_token;
  }

  // 尝试刷新
  const result = await refreshTokenServer();
  return result?.access_token ?? null;
}

/**
 * 清除Token缓存（用于登出或刷新失败时）
 */
export function clearTokenCache(): void {
  refreshState.lastResult = null;
  refreshState.isRefreshing = false;
  refreshState.refreshPromise = null;
  console.log("🗑️ [Server] Token缓存已清除");
}
