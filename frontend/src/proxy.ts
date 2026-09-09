import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { auth } from "@/auth";
import { adminAuth } from "@/admin-auth";
import { debugLog } from "@/lib/auth/config";
import { isTokenValid } from "@/lib/auth/core/jwt";
import type { AuthMiddlewareResult } from "@/lib/auth/middleware/auth-middleware";

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
    (prefix) => pathname === prefix || pathname.startsWith(prefix + "/"),
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
 * 构建 admin 请求头：注入 nonce/pathname，并用 session 中可能已刷新的 token
 * 覆盖请求 cookie。
 *
 * 必要性：proxy 层刷新 token 后只写响应 Set-Cookie，但 Server Component 通过
 * `cookies()` 读的是**请求 cookie**（旧值）。若不覆盖，Server Component 会用
 * 过期 access_token 请求 `/api/v1/auth/me` → 401 → redirect 到 `/api/auth/refresh`，
 * 而该 redirect 响应会丢弃 proxy 设置的 Set-Cookie，浏览器仍带已被 rotation
 * 撤销的旧 refresh_token → 二次刷新失败 → 登出。
 *
 * 覆盖安全性：未刷新时 session token 与请求 cookie 相同，覆盖等于无操作；
 * JWT 仅含 base64url + `.`，可直接拼接 cookie header。
 */
function buildAdminRequestHeaders(
  request: NextRequest,
  session: AuthMiddlewareResult,
  nonce: string,
): Headers {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("x-pathname", request.nextUrl.pathname);

  if (session.accessToken && session.refreshToken) {
    const accessName = adminAuth.config.cookieNames.accessToken;
    const refreshName = adminAuth.config.cookieNames.refreshToken;
    const otherCookies = (requestHeaders.get("cookie") ?? "")
      .split(";")
      .map((c) => c.trim())
      .filter((c) => {
        const name = c.split("=")[0];
        return name !== accessName && name !== refreshName;
      });
    otherCookies.push(`${accessName}=${session.accessToken}`);
    otherCookies.push(`${refreshName}=${session.refreshToken}`);
    requestHeaders.set("cookie", otherCookies.join("; "));
  }

  return requestHeaders;
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
      // 刷新瞬时失败（5xx/网络/超时）但 refresh_token 仍有效且未被后端明确拒绝：
      // 放行请求（不清 cookie、不跳登录），由下游 401 → refresh 路由兜底恢复
      //（路由层对瞬时失败返回 503 保留 cookie）。
      const recoverable =
        session.refreshToken && isTokenValid(session.refreshToken) && !session.refreshRejected;
      if (!recoverable) {
        debugLog("proxy: C-side unauthenticated — redirecting to login", { pathname });
        const loginUrl = new URL("/login", request.url);
        // 与 refresh/route.ts 对齐：仅当 pathname 非默认首页时透传 redirect，避免冗余参数
        if (pathname !== "/") {
          loginUrl.searchParams.set("redirect", pathname);
        }
        return applyCsp(session.redirect(loginUrl), nonce);
      }
      debugLog("proxy: C-side refresh transiently failed — passing through", { pathname });
      return applyCsp(session.response(nextWithNonce(request, nonce)), nonce);
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

  // ── 4. Admin-side auth ──
  // 对所有保护路径请求（HTML 整页 + RSC 软导航）执行 proxy 层认证与自动刷新，
  // 消除「整页刷新能续期、点击跳转不能续期」的路径不对称（此前软导航 401 后
  // 只能依赖 4 跳补救链，任一环失败即跳登录/白屏）。
  // 客户端 API 请求不经过本层（第 3 步已跳过 /api 前缀）。
  //
  // 注意：无法在 proxy 内识别预取请求 —— Next.js 会从 proxy 的 request.headers
  // 中剥离全部 Flight 头（rsc / next-router-state-tree / next-router-prefetch，
  // 见 Next 16 官方文档 proxy.md「RSC requests and rewrites」）。预取请求与导航
  // 请求一样走 resolveAdminAuth：刷新仅在 access_token 缺失/过期/临近阈值时触发，
  // 并发经 dedupServerRefresh（2s 窗口）合并；预取引发的偶发刷新失败按瞬时故障
  // 放行（refresh 路由 503 保留 cookie），不会误杀会话。
  const session = await resolveAdminAuth(request);

  if (!session.isAuthenticated) {
    // 刷新瞬时失败但 refresh_token 仍有效且未被后端明确拒绝：放行请求，
    // 由下游 401 → /api/auth/refresh 兜底（路由层对瞬时失败返回 503 保留 cookie）。
    const recoverable =
      session.refreshToken && isTokenValid(session.refreshToken) && !session.refreshRejected;
    if (!recoverable) {
      debugLog("proxy: admin unauthenticated — redirecting to /admin/login", { pathname });
      const loginUrl = new URL("/admin/login", request.url);
      // 与 refresh/route.ts 对齐：仅当 pathname 非默认 /admin 时透传 redirect，避免冗余参数
      if (pathname !== "/admin") {
        loginUrl.searchParams.set("redirect", pathname);
      }
      return applyCsp(session.redirect(loginUrl), nonce);
    }
    debugLog("proxy: admin refresh transiently failed — passing through", { pathname });
    return applyCsp(session.response(nextWithNonce(request, nonce)), nonce);
  }

  // 用 session 中可能已刷新的 token 覆盖请求 cookie，让 Server Component
  // 通过 cookies() 读到新 token，避免 401 → redirect → 二次刷新失败链路。
  const requestHeaders = buildAdminRequestHeaders(request, session, nonce);
  const nextResponse = NextResponse.next({ request: { headers: requestHeaders } });
  return applyCsp(session.response(nextResponse), nonce);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
