import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { apiPaths, getApiUrl } from "@/lib/config";

const PROTECTED_C_PREFIXES = ["/c/valuation", "/c/leads", "/c/my", "/c/profile"];

const C_DOMAINS = (process.env.C_DOMAINS || "fangmengchina.com,www.fangmengchina.com")
  .split(",")
  .map((d) => d.trim())
  .filter(Boolean);

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

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const host = request.headers.get("host") || "";
  const hostname = host.split(":")[0];
  const isLocalhost = hostname === "localhost" || hostname === "127.0.0.1";

  // ── 1. C-side domain routing ──
  let rewritePath: string | null = null;

  if (!isLocalhost) {
    const isCDomain = C_DOMAINS.includes(hostname);
    const isAdminDomain = ADMIN_DOMAINS.includes(hostname);

    if (
      isCDomain &&
      !pathname.startsWith("/c") &&
      !pathname.startsWith("/api") &&
      !pathname.startsWith("/_next")
    ) {
      rewritePath = "/c" + pathname;
    }

    if (isAdminDomain && pathname.startsWith("/c")) {
      const url = request.nextUrl.clone();
      url.pathname = "/";
      return NextResponse.redirect(url);
    }
  }

  const effectivePathname = rewritePath || pathname;

  // ── 2. C-side auth route guard + token refresh ──
  if (isProtectedCPath(effectivePathname)) {
    const accessToken = request.cookies.get("c_access_token")?.value;
    const refreshToken = request.cookies.get("c_refresh_token")?.value;

    if (!accessToken && !refreshToken) {
      const url = request.nextUrl.clone();
      url.pathname = "/c/login";
      url.searchParams.set("redirect", effectivePathname);
      return NextResponse.redirect(url);
    }

    const accessTokenExpired = accessToken ? isTokenExpired(accessToken) : true;

    if (accessTokenExpired && refreshToken && !isTokenExpired(refreshToken, 0)) {
      const isHtmlRequest = request.headers.get("accept")?.includes("text/html");

      if (isHtmlRequest) {
        try {
          const response = await fetch(getApiUrl(apiPaths.cAuth.refresh), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ refresh_token: refreshToken }),
          });

          if (response.ok) {
            const data = await response.json();
            const nextResponse = NextResponse.next();

            nextResponse.cookies.set("c_access_token", data.access_token, {
              httpOnly: true,
              secure: process.env.NODE_ENV === "production",
              path: "/",
              maxAge: data.expires_in || 36000,
              sameSite: "lax",
            });

            if (data.refresh_token) {
              nextResponse.cookies.set("c_refresh_token", data.refresh_token, {
                httpOnly: true,
                secure: process.env.NODE_ENV === "production",
                path: "/",
                maxAge: 60 * 60 * 24 * 7,
                sameSite: "lax",
              });
            }

            return addSecurityHeaders(nextResponse);
          }

          if (response.status === 401 || response.status === 403) {
            const redirectResponse = NextResponse.redirect(
              new URL("/c/login", request.url)
            );
            redirectResponse.cookies.delete("c_access_token");
            redirectResponse.cookies.delete("c_refresh_token");
            return redirectResponse;
          }
        } catch {
          // network error, continue processing
        }
      }
    }
  }

  // Apply domain rewrite
  if (rewritePath) {
    const url = request.nextUrl.clone();
    url.pathname = rewritePath;
    return addSecurityHeaders(NextResponse.rewrite(url));
  }

  // Skip C-side direct paths from admin token refresh
  if (pathname.startsWith("/c")) {
    return addSecurityHeaders(NextResponse.next());
  }

  // ── 3. Admin-side: skip paths that don't need auth ──
  if (
    pathname.startsWith("/login") ||
    pathname.startsWith("/api/v1/auth") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname === "/favicon.ico"
  ) {
    return NextResponse.next();
  }

  // ── 4. Admin-side token refresh ──
  const accessToken = request.cookies.get("access_token")?.value;
  const refreshToken = request.cookies.get("refresh_token")?.value;

  if (!refreshToken) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const shouldRefresh = !accessToken || isTokenExpired(accessToken);

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

        return addSecurityHeaders(nextResponse);
      }

      if (response.status === 401 || response.status === 403) {
        const redirectResponse = NextResponse.redirect(
          new URL("/login", request.url)
        );
        redirectResponse.cookies.delete("access_token");
        redirectResponse.cookies.delete("refresh_token");
        return redirectResponse;
      }
    } catch {
      // network error, continue processing
    }
  }

  return addSecurityHeaders(NextResponse.next());
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
