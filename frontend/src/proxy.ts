import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { apiPaths, getApiUrl } from "@/lib/config";
import { auth } from "@/auth";
import { debugLog } from "@/lib/auth/config";
import { dedupServerRefresh } from "@/lib/auth/server/refresh-dedup";

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

function decodeJWTPayload(token: string): Record<string, unknown> | null {
  try {
    const base64 = token.split(".")[1];
    if (!base64) return null;
    const padded = base64.replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(atob(padded));
    return payload;
  } catch {
    return null;
  }
}

function isTokenExpired(token: string, bufferMs = 5 * 60 * 1000): boolean {
  const payload = decodeJWTPayload(token);
  if (!payload || typeof payload.exp !== "number") return true;
  return payload.exp * 1000 - Date.now() < bufferMs;
}

function addSecurityHeaders(response: NextResponse): NextResponse {
  if (process.env.NODE_ENV === "production") {
    response.headers.set(
      "Strict-Transport-Security",
      "max-age=63072000; includeSubDomains; preload"
    );
  }
  return response;
}

export default async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const host = request.headers.get("host") || "";
  const hostname = host.split(":")[0];
  const isLocalhost = hostname === "localhost" || hostname === "127.0.0.1";

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
    const resolveAuth = auth.createMiddleware();
    const session = await resolveAuth(request);

    if (!session.isAuthenticated) {
      // 无 token 或刷新失败：清 cookies 并重定向到登录页
      debugLog("proxy: C-side unauthenticated — redirecting to login", { pathname });
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("redirect", pathname);
      return session.redirect(loginUrl);
    }

    // 已认证：写回可能刷新后的 token cookies
    return addSecurityHeaders(session.response(NextResponse.next()));
  }

  // ── 3. Admin-side: only process /admin paths ──
  if (!pathname.startsWith("/admin")) {
    return addSecurityHeaders(NextResponse.next());
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
    return NextResponse.next();
  }

  // ── 4. Admin-side token refresh ──
  const accessToken = request.cookies.get("access_token")?.value;
  const refreshToken = request.cookies.get("refresh_token")?.value;

  if (!refreshToken || refreshToken === "") {
    debugLog("proxy: admin no refresh_token — redirecting to /admin/login", { pathname });
    return NextResponse.redirect(new URL("/admin/login", request.url));
  }

  const shouldRefresh = !accessToken || isTokenExpired(accessToken);

  // 仅对 HTML 页面请求执行 proxy 层刷新，避免并发 API 请求多次触发刷新
  // 客户端 API 请求的 401 由 api-client.ts / swr.ts 的刷新重试机制处理
  const isHtmlRequest = request.headers.get("accept")?.includes("text/html");

  if (shouldRefresh && refreshToken && isHtmlRequest) {
    debugLog("proxy: admin refreshing token", { pathname, reason: !accessToken ? "no access_token" : "expired" });

    // Dedup concurrent refresh calls for the same refresh_token: refresh
    // token rotation revokes the old token on each refresh, so without
    // dedup, concurrent HTML requests (multi-tab) would each fire an
    // independent refresh and all but one would fail.
    const refreshResult = await dedupServerRefresh(refreshToken, async () => {
      try {
        const response = await fetch(getApiUrl(apiPaths.auth.refresh), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refresh_token: refreshToken }),
        });
        if (!response.ok) {
          return { ok: false as const, status: response.status };
        }
        const data = await response.json();
        return { ok: true as const, data };
      } catch {
        return { ok: false as const, networkError: true };
      }
    });

    if (refreshResult.ok) {
      const data = refreshResult.data;
      const nextResponse = NextResponse.next();

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

      debugLog("proxy: admin token refresh successful", { pathname });
      return addSecurityHeaders(nextResponse);
    }

    if ("networkError" in refreshResult) {
      debugLog("proxy: admin refresh network error — continuing", { pathname });
    } else if (refreshResult.status === 401 || refreshResult.status === 403) {
      debugLog("proxy: admin refresh rejected — redirecting to /admin/login", {
        pathname,
        status: refreshResult.status,
      });
      const redirectResponse = NextResponse.redirect(
        new URL("/admin/login", request.url)
      );
      redirectResponse.cookies.delete("access_token");
      redirectResponse.cookies.delete("refresh_token");
      return redirectResponse;
    } else {
      debugLog("proxy: admin refresh non-ok status", { pathname, status: refreshResult.status });
    }
  }

  return addSecurityHeaders(NextResponse.next());
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
