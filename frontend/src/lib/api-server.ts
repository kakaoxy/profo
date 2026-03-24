// src/lib/api-server.ts
import createClient from "openapi-fetch";
import type { paths } from "./api-types";
import { cookies } from "next/headers";
import { API_BASE_URL } from "./config";
import { getValidAccessToken, clearTokenCache } from "./token-refresh-server";

/**
 * 仅限服务端组件 (Server Components) 和 Server Actions 使用
 * 它可以直接读取 Cookie，并在遇到 401 时自动刷新 Token
 *
 * 修复内容：
 * 1. 使用全局token缓存避免并发刷新竞争
 * 2. 正确处理刷新后的token同步
 * 3. 刷新失败时清除状态并返回401
 */
export async function fetchClient() {
  // 获取当前有效的token（会自动处理刷新）
  let token = await getValidAccessToken();

  // 创建一个自定义的 fetch 函数来处理 401 自动刷新
  const fetchWithAutoRefresh: typeof fetch = async (input, init) => {
    // 如果是 Request 对象，提取 headers
    const requestHeaders = input instanceof Request
      ? Object.fromEntries(input.headers.entries())
      : {};

    // 合并 headers：Request headers < init headers < Authorization
    const finalHeaders = {
      ...requestHeaders,
      ...init?.headers,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };

    // 第一次请求
    const response = await fetch(input, {
      ...init,
      headers: finalHeaders,
    });

    // 如果不是 401，直接返回
    if (response.status !== 401) {
      return response;
    }

    // 401 错误处理：尝试刷新 token
    console.log("🔁 [Server] 检测到 401，尝试刷新 Token...");

    // 清除缓存，强制重新刷新
    clearTokenCache();
    const newToken = await getValidAccessToken();

    if (!newToken) {
      // 刷新失败，清除cookie并返回原始401响应
      console.error("🔁 [Server] Token 刷新失败，需要重新登录");

      // 尝试清除过期的cookies
      try {
        const cookieStore = await cookies();
        // 注意：Server Component中无法直接删除cookie，需要后续处理
        console.log("🔁 [Server] 请清除过期的登录状态");
      } catch {
        // 忽略cookie操作错误
      }

      return response;
    }

    // 用新 Token 重试请求
    token = newToken;
    console.log("🔁 [Server] 使用新 Token 重试请求...");

    return fetch(input, {
      ...init,
      headers: {
        ...requestHeaders,
        ...init?.headers,
        Authorization: `Bearer ${newToken}`,
      },
    });
  };

  return createClient<paths>({
    baseUrl: API_BASE_URL,
    // 使用我们的自定义 fetch，在 fetch 中统一处理 Authorization header
    fetch: fetchWithAutoRefresh,
  });
}
