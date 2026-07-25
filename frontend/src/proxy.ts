import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { auth } from "@/auth";
import { adminAuth } from "@/admin-auth";
import { debugLog } from "@/lib/auth/config";

// Module-level singletons: library design intends one resolver reused across requests.
// C端与 admin 各自捕获自己的 resolved config，互不干扰（Task 5 singleton 修复）。
const resolveAuth = auth.createMiddleware();
const resolveAdminAuth = adminAuth.createMiddleware();

const PROTECTED_C_PREFIXES = ["/valuation", "/leads", "/my", "/profile"];

const ADMIN_DOMAINS = (process.env.ADMIN_DOMAINS || "admin.fangmengchina.com")
  .split(",")
  .map((d) => d.trim())
  .filter(Boolean);

function isProtectedCPath(pathname: string): boolean {
  return PROTECTED_C_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(prefix + "/")
  );
}

/**
 * 创建带 nonce 与 pathname 请求头的 NextResponse.next()。
 *
 * 将 nonce 写入 **请求头**（而非响应头），使 Server Components 可通过
 * `headers()` 读取。Next.js 会自动将 `x-nonce` 请求头注入到框架自身
 * 生成的内联脚本（RSC payload 等），切换到 CSP 强制模式时不会误拦。
 *
 * Task 8.1: 同时注入 `x-pathname`，让 Server Component 内的工具（如
 * `api-server.ts` 的 401 自动刷新）能读取当前路径以构造 `?next=<path>`
 * 重定向 URL。Next.js 16 已移除自动 `x-invoke-path`/`x-pathname`，
 * 必须由 middleware 显式注入。
 */
function nextWithNonce(request: NextRequest, nonce: string): NextResponse {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("x-pathname", request.nextUrl.pathname);
  return NextResponse.next({
    request: { headers: requestHeaders },
  });
}

/**
 * 将 CSP 头写入响应（当前为 Report-Only 模式）。
 *
 * HSTS 由 TLS 终止层（nginx）负责配置，不在应用代理层设置。
 */
function applyCsp(response: NextResponse, nonce: string): NextResponse {
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}'`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "connect-src 'self'",
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
  response.headers.set("Content-Security-Policy-Report-Only", csp);
  return response;
}

export default async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const host = request.headers.get("host") || "";
  const hostname = host.split(":")[0];
  const isLocalhost = hostname === "localhost" || hostname === "127.0.0.1";
  const nonce = randomUUID();

  // ── 1. Domain routing ──
  if (!isLocalhost) {
    const isAdminDomain = ADMIN_DOMAINS.includes(hostname);

    // Admin domain: redirect /admin paths to / (admin should use admin domain directly)
    if (isAdminDomain && pathname.startsWith("/admin")) {
      debugLog("proxy: admin domain redirecting /admin path to /", { hostname, pathname });
      const url = request.nextUrl.clone();
      url.pathname = "/";
      return NextResponse.redirect(url);
    }
  }

  // ── 2. C-side protected paths: 用 library middleware 检查认证 + 自动刷新 ──
  // Skip admin paths for C-side auth
  if (!pathname.startsWith("/admin") && isProtectedCPath(pathname)) {
    const session = await resolveAuth(request);

    if (!session.isAuthenticated) {
      // 无 token 或刷新失败：清 cookies 并重定向到登录页
      debugLog("proxy: C-side unauthenticated — redirecting to login", { pathname });
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("redirect", pathname);
      return applyCsp(session.redirect(loginUrl), nonce);
    }

    // 已认证：写回可能刷新后的 token cookies
    return applyCsp(session.response(nextWithNonce(request, nonce)), nonce);
  }

  // ── 3. Admin-side: only process /admin paths ──
  if (!pathname.startsWith("/admin")) {
    return applyCsp(nextWithNonce(request, nonce), nonce);
  }

  // Admin: skip paths that don't need auth
  if (
    pathname.startsWith("/admin/login") ||
    pathname.startsWith("/api/v1/auth") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname.startsWith("/static") ||
    pathname === "/favicon.ico"
  ) {
    return applyCsp(nextWithNonce(request, nonce), nonce);
  }

  // ── 4. Admin-side auth (HTML requests only) ──
  // 仅对 HTML 页面请求执行 proxy 层刷新，避免并发 API 请求多次触发刷新。
  // 客户端 API 请求的 401 由 api-server.ts 的 forceRefreshToken 重试机制处理
  // （内部走 adminAuth.adapter.refreshToken + setTokenCookies，复用统一 dedup）。
  // adminAuth.createMiddleware() 已捕获 admin resolved config，不依赖 singleton。
  const isHtmlRequest = request.headers.get("accept")?.includes("text/html");

  if (!isHtmlRequest) {
    return applyCsp(nextWithNonce(request, nonce), nonce);
  }

  const session = await resolveAdminAuth(request);

  if (!session.isAuthenticated) {
    debugLog("proxy: admin unauthenticated — redirecting to /admin/login", { pathname });
    return applyCsp(session.redirect(new URL("/admin/login", request.url)), nonce);
  }

  return applyCsp(session.response(nextWithNonce(request, nonce)), nonce);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
