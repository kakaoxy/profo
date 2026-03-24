// src/lib/api-server.ts
import createClient from "openapi-fetch";
import type { paths } from "./api-types";
import { cookies } from "next/headers";
import { API_BASE_URL } from "./config";

/**
 * 尝试使用 refresh_token 刷新 access_token
 * 
 * @returns 新的 access_token 或 null
 */
async function tryRefreshToken(): Promise<string | null> {
  const cookieStore = await cookies();
  const refreshToken = cookieStore.get("refresh_token")?.value;

  if (!refreshToken) {
    console.warn("🔁 [Server] 无 refresh_token，无法刷新");
    return null;
  }

  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });

    if (!response.ok) {
      console.error("🔁 [Server] Token 刷新失败，状态码:", response.status);
      return null;
    }

    const data = await response.json();
    
    // 注意：不在此处更新 Cookie
    // Server Component 渲染阶段无法设置 Cookie (Next.js 限制)
    // Cookie 更新由 middleware.ts 在请求到达前主动处理
    // 此处仅返回新 Token 供当前请求使用

    console.log("✅ [Server] 成功刷新 access_token");
    return data.access_token;
  } catch (error) {
    console.error("🔁 [Server] 刷新 Token 时发生网络错误:", error);
    return null;
  }
}

/**
 * 仅限服务端组件 (Server Components) 和 Server Actions 使用
 * 它可以直接读取 Cookie，并在遇到 401 时自动刷新 Token
 */
export async function fetchClient() {
  const cookieStore = await cookies();
  let token = cookieStore.get("access_token")?.value;

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

    // 尝试刷新 Token
    console.log("🔁 [Server] 检测到 401，尝试刷新 Token...");
    const newToken = await tryRefreshToken();

    if (!newToken) {
      // 刷新失败，返回原始 401 响应
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
