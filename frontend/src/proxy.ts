import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { apiPaths, getApiUrl } from "@/lib/config";

/**
 * Proxy (原 Middleware)：用于在请求到达渲染层之前主动刷新 Token
 * 解决 Server Components 渲染阶段无法修改 Cookie 的问题
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 1. 排除不需要 Auth 的路径
  if (
    pathname.startsWith("/login") ||
    pathname.startsWith("/api/v1/auth") ||
    pathname.includes("_next") ||
    pathname.includes("favicon.ico")
  ) {
    return NextResponse.next();
  }

  const accessToken = request.cookies.get("access_token")?.value;
  const refreshToken = request.cookies.get("refresh_token")?.value;

  // 2. 如果没有 refresh_token，直接跳转登录 (除非已经在登录页)
  if (!refreshToken && !pathname.startsWith("/login")) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // 3. 检查 access_token 是否即将过期
  let shouldRefresh = !accessToken;

  if (accessToken) {
    try {
      // 简单 Base64 解码 JWT payload
      const payloadBase64 = accessToken.split(".")[1];
      if (payloadBase64) {
        const payload = JSON.parse(atob(payloadBase64));
        const exp = payload.exp * 1000;
        const now = Date.now();
        // 如果剩余时间小于 5 分钟，主动刷新
        if (exp - now < 5 * 60 * 1000) {
          shouldRefresh = true;
          console.log("🔁 [Middleware] Token 即将过期，触发主动刷新...");
        }
      }
    } catch (e) {
        console.error("❌ [Middleware] Token 刷新失败:", e);
      shouldRefresh = true;
    }
  }

  // 4. 执行刷新逻辑
  // 限制仅在请求 HTML 页面时刷新，避免并发请求（如 RSC payload）触发多次刷新
  const isHtmlRequest = request.headers.get("accept")?.includes("text/html");

  if (shouldRefresh && refreshToken && isHtmlRequest) {
    try {
      const response = await fetch(getApiUrl(apiPaths.auth.refresh), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });

      if (response.ok) {
        const data = await response.json();
        const nextResponse = NextResponse.next();

        // 在中间件中更新 Cookie 是安全的
        nextResponse.cookies.set("access_token", data.access_token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          path: "/",
          maxAge: data.expires_in || 36000,
          sameSite: "lax",
        });

        nextResponse.cookies.set("refresh_token", data.refresh_token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          path: "/",
          maxAge: 60 * 60 * 24 * 7,
          sameSite: "lax",
        });

        console.log("✅ [Middleware] Token 主动刷新成功");
        return nextResponse;
      }
    } catch (error) {
      console.error("❌ [Middleware] Token 刷新失败:", error);
    }
  }

  return NextResponse.next();
}

// 匹配所有路径，除了静态资源
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
