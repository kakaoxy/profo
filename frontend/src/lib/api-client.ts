import createClient, { type Middleware } from "openapi-fetch";
import type { paths } from "./api-types";
import { getClientApiUrl } from "./config";

/**
 * 尝试刷新 Token（客户端版本，调用 /api/auth/refresh 路由）
 * 不缓存刷新 promise，每个调用独立执行，避免并发竞态导致误判
 */
async function tryRefreshTokenClient(): Promise<boolean> {
  try {
    const response = await fetch("/api/auth/refresh", {
      method: "POST",
      credentials: "include",
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
  }
}

/**
 * 自定义中间件：确保请求携带 credentials
 *
 * [安全修复] 所有请求必须携带 httpOnly Cookie
 */
const credentialsMiddleware: Middleware = {
  async onRequest({ request }) {
    // 确保请求携带 cookies
    // 注意：token 已由 httpOnly Cookie 自动携带，无需手动设置 Authorization
    // 克隆请求并设置 credentials
    const newRequest = new Request(request, {
      credentials: "include",
      // 保留原始的 signal (AbortController)
      signal: request.signal,
    });
    return newRequest;
  },
};

/**
 * 自定义中间件：处理 Token 注入和全局错误拦截
 *
 * [安全修复] 不再从 localStorage 读取 token
 * 改为依赖 httpOnly Cookie 自动携带
 * 中间件仅处理 401 刷新逻辑
 */
const authMiddleware: Middleware = {
  // 响应拦截器：全局错误处理 + 自动刷新
  async onResponse({ response, request }) {
    // 处理 401 Unauthorized
    if (response.status === 401) {
      const url = response.url;

      // 豁免名单：refresh 接口本身不应触发刷新循环
      if (url.includes("/auth/refresh")) {
        return response;
      }

      // 豁免 /auth/me 接口的偶发 401
      if (url.includes("/auth/me") || url.includes("/api/v1/auth/me")) {
        console.warn("⚠️ 检测到 /auth/me 返回 401，尝试刷新 Token...");
      }

      // 尝试刷新 Token
      console.log("🔁 [Client] 检测到 401，尝试刷新 Token...");
      const refreshed = await tryRefreshTokenClient();

      if (refreshed) {
        // 刷新成功，重试原始请求
        console.log("🔁 [Client] Token 刷新成功，重试原始请求...");

        // [关键修复] 添加短暂延迟确保 cookie 已更新
        // 浏览器写入 cookie 可能有极短的延迟
        await new Promise(resolve => setTimeout(resolve, 100));

        // [关键修复] 重新构造请求，确保携带最新的 cookie
        // 注意：request.body 可能是 ReadableStream，需要特殊处理
        let body: BodyInit | null = null;
        if (request.body) {
          // 克隆 body，因为 ReadableStream 只能读取一次
          const clonedRequest = request.clone();
          body = await clonedRequest.text();
        }

        const retryResponse = await fetch(request.url, {
          method: request.method,
          headers: request.headers,
          body: body,
          credentials: "include",
          mode: request.mode,
          cache: request.cache,
          // 保留原始的 signal (AbortController)
          signal: request.signal,
        });

        return retryResponse;
      }

      // 刷新失败，执行登出逻辑
      console.error("🔒 登录已过期且刷新失败，正在跳转登录页...");

      if (typeof window !== "undefined") {
        // [安全修复] 不再操作 localStorage，仅跳转登录页
        // 清除操作由服务端 logoutAction 处理

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
 *
 * [安全修复] 通过 credentialsMiddleware 确保所有请求携带 httpOnly Cookie
 */
export const client = createClient<paths>({
  baseUrl: getClientApiUrl(""),
});

// 注册中间件：credentials 中间件必须先注册，确保所有请求携带 cookie
client.use(credentialsMiddleware);
// 注册认证中间件，处理 401 刷新
client.use(authMiddleware);
