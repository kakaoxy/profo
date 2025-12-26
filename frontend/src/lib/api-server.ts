// src/lib/api-server.ts
import createClient from "openapi-fetch";
import type { paths } from "./api-types";
import { cookies } from "next/headers";

const baseUrl = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

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
    const response = await fetch(`${baseUrl}/api/v1/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });

    if (!response.ok) {
      console.error("🔁 [Server] Token 刷新失败，状态码:", response.status);
      return null;
    }

    const data = await response.json();
    
    // 更新 cookies
    try {
      cookieStore.set("access_token", data.access_token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: data.expires_in || 36000, // 默认 10 小时
        sameSite: "lax",
      });

      cookieStore.set("refresh_token", data.refresh_token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 60 * 60 * 24 * 7, // 7 days
        sameSite: "lax",
      });
      console.log("✅ [Server] 成功更新 Token Cookies");
    } catch (_) {
      // 在 Server Components 渲染阶段 (Render Phase) 无法设置 Cookie
      // 我们捕获这个错误，允许本次请求继续透传使用新 Token
      console.warn("⚠️ [Server] 无法在当前上下文更新 Cookies (渲染阶段)，但这不影响本次请求使用新 Token");
      console.error("❌ [Server] 无法在当前上下文更新 Cookies (渲染阶段)", _);
    }

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
    // 第一次请求
    const response = await fetch(input, {
      ...init,
      headers: {
        ...init?.headers,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
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
        ...init?.headers,
        Authorization: `Bearer ${newToken}`,
      },
    });
  };

  return createClient<paths>({
    baseUrl,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    // 使用我们的自定义 fetch
    fetch: fetchWithAutoRefresh,
  });
}
