import createClient, { type Middleware } from "openapi-fetch";
import type { paths } from "./api-types";

// 获取环境变量中的后端地址
const baseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// 防止并发刷新
let isRefreshing = false;
let refreshPromise: Promise<boolean> | null = null;

/**
 * 尝试刷新 Token (客户端版本，调用 Server Action)
 */
async function tryRefreshTokenClient(): Promise<boolean> {
  // 如果已经在刷新中，等待刷新结果
  if (isRefreshing && refreshPromise) {
    return refreshPromise;
  }

  isRefreshing = true;
  refreshPromise = (async () => {
    try {
      // 调用后端 API 进行刷新 (需要 refresh_token 在 cookie 中)
      // 由于 refresh_token 是 httpOnly，客户端无法直接读取
      // 我们需要通过后端 API 路由来处理
      const response = await fetch("/api/auth/refresh", {
        method: "POST",
        credentials: "include", // 重要：携带 cookies
      });

      if (!response.ok) {
        console.error("🔁 [Client] Token 刷新失败，状态码:", response.status);
        return false;
      }

      console.log("✅ [Client] 成功刷新 Token");
      return true;
    } catch (error) {
      console.error("🔁 [Client] 刷新 Token 时发生错误:", error);
      return false;
    } finally {
      isRefreshing = false;
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

/**
 * 自定义中间件：处理 Token 注入和全局错误拦截
 */
const authMiddleware: Middleware = {
  // 1. 请求拦截器：自动注入 Token
  async onRequest({ request }) {
    // 仅在浏览器端执行 (Client Component)
    if (typeof window !== "undefined") {
      const token =
        localStorage.getItem("access_token") || localStorage.getItem("token");

      if (token) {
        request.headers.set("Authorization", `Bearer ${token}`);
      }
    }
    return request;
  },

  // 2. 响应拦截器：全局错误处理 + 自动刷新
  async onResponse({ response, request }) {
    // 处理 401 Unauthorized
    if (response.status === 401) {
      const url = response.url;

      // 豁免名单：refresh 接口本身不应触发刷新循环
      if (url.includes("/auth/refresh")) {
        return response;
      }

      // 豁免 /auth/me 接口的偶发 401
      if (url.includes("/auth/me") || url.includes("/api/auth/me")) {
        console.warn("⚠️ 检测到 /auth/me 返回 401，尝试刷新 Token...");
      }

      // 尝试刷新 Token
      console.log("🔁 [Client] 检测到 401，尝试刷新 Token...");
      const refreshed = await tryRefreshTokenClient();

      if (refreshed) {
        // 刷新成功，重试原始请求
        console.log("🔁 [Client] Token 刷新成功，重试原始请求...");
        return fetch(request);
      }

      // 刷新失败，执行登出逻辑
      console.error("🔒 登录已过期且刷新失败，正在跳转登录页...");

      if (typeof window !== "undefined") {
        // 清除本地存储的 Token
        localStorage.removeItem("access_token");
        localStorage.removeItem("token");
        localStorage.removeItem("refresh_token");

        // 强制跳转回登录页
        if (!window.location.pathname.includes("/login")) {
          window.location.href = `/login?redirect=${encodeURIComponent(
            window.location.pathname
          )}`;
        }
      }
    }
    return response;
  },
};


/**
 * 场景 A: 客户端组件 (Client Components) 使用
 */
export const client = createClient<paths>({
  baseUrl,
  // 注意：这里不要再传 middleware 数组，因为类型不支持
});

// [修复] 使用 .use() 方法注册中间件
client.use(authMiddleware);
