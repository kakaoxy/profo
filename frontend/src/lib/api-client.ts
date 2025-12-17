import createClient, { type Middleware } from "openapi-fetch";
import type { paths } from "./api-types";

// 获取环境变量中的后端地址
const baseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

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

  // 2. 响应拦截器：全局错误处理
  async onResponse({ response }) {
    // 处理 401 Unauthorized
    if (response.status === 401) {
      const url = response.url;

      // [⭐ 核心修复] 豁免名单
      // 如果是获取用户信息的接口报 401，通常是并发导致的偶发问题
      // 我们选择忽略它，不执行强制登出
      if (url.includes("/auth/me") || url.includes("/api/auth/me")) {
        console.warn("⚠️ 检测到 /auth/me 返回 401，已忽略，不执行强制登出。");
        return response;
      }

      // 对于其他接口（如获取列表、修改数据），如果是 401，说明真的过期了
      console.error("🔒 登录已过期，正在跳转登录页...");

      if (typeof window !== "undefined") {
        // 1. 清除本地存储的 Token
        localStorage.removeItem("access_token");
        localStorage.removeItem("token");
        localStorage.removeItem("refresh_token");

        // 2. 强制跳转回登录页 (带上当前的 redirect 以便登录后跳回)
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
