import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSecondsUntilExpiry, isTokenValid } from "../core/jwt";
import { isApiStatusError, isDefinitiveRejection, type ResolvedAuthConfig } from "../types";
import { getGlobalAuthConfig, debugLog } from "../config";
import { dedupServerRefresh } from "../server/refresh-dedup";

export interface AuthMiddlewareResult {
  /** True if the request has a valid, non-expired access token. */
  isAuthenticated: boolean;
  /** The current access token (may be a freshly rotated one). */
  accessToken: string | null;
  /** The current refresh token (may be a freshly rotated one). */
  refreshToken: string | null;
  /**
   * True when a refresh was attempted and the backend definitively rejected
   * the refresh token (HTTP 401/403). False for transient failures
   * (5xx/429/network/timeout) where the session may still be recoverable.
   */
  refreshRejected: boolean;
  /**
   * Wraps a NextResponse, writing any refreshed token cookies onto it.
   * Always use this instead of returning the response directly.
   *
   * @example
   * return session.response(NextResponse.next());
   * return session.response(NextResponse.redirect(url));
   */
  response: (base: NextResponse) => NextResponse;
  /**
   * Redirects to a URL. Session cookies are cleared only when the session is
   * definitively dead (no refresh token, refresh token expired/invalid, or
   * backend rejected the refresh). Transient refresh failures keep the
   * cookies so later requests can still recover.
   *
   * @example
   * return session.redirect(new URL("/login", request.url));
   */
  redirect: (url: URL) => NextResponse;
}

/**
 * Converts a path pattern string to a regular expression.
 * Supports `:param` (single segment) and `:path*` (zero-or-more segments) wildcards.
 *
 * @param pattern - A path pattern string (e.g. `"/dashboard/:path*"`, `"/user/:id"`).
 * @returns A regular expression that matches URLs following the pattern.
 *
 * @example
 * // "/dashboard/:path*"  → matches /dashboard, /dashboard/settings, etc.
 * // "/user/:id"          → matches /user/123 but not /user/123/profile
 */
const regexCache = new Map<string, RegExp>();

export function patternToRegex(pattern: string): RegExp {
  const cached = regexCache.get(pattern);
  if (cached) return cached;
  const escaped = pattern
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\/:[\w]+\*/g, "(?:/.*)?")
    .replace(/:[\w]+\*/g, ".*")
    .replace(/:[\w]+/g, "[^/]+");
  const regex = new RegExp(`^${escaped}\\/?$`);
  regexCache.set(pattern, regex);
  return regex;
}

/**
 * Returns `true` if `pathname` matches any of the provided path patterns.
 *
 * @param pathname - The URL pathname to test (e.g. `"/dashboard/settings"`).
 * @param patterns - An array of path patterns to match against (supports `:param` and `:path*` wildcards).
 * @returns `true` if the pathname matches at least one pattern; `false` otherwise.
 *
 * @example
 * auth.matchesPath("/dashboard/settings", ["/dashboard/:path*"]) // true
 * auth.matchesPath("/login", ["/", "/login"])                    // true
 */
export function matchesPath(pathname: string, patterns: string[]): boolean {
  return patterns.some((pattern) => patternToRegex(pattern).test(pathname));
}

function writeTokensToResponse(
  response: NextResponse,
  accessToken: string,
  refreshToken: string,
  config: ResolvedAuthConfig,
): void {
  const accessExpiry = getSecondsUntilExpiry(accessToken);
  const refreshExpiry = getSecondsUntilExpiry(refreshToken);

  const baseOptions = {
    httpOnly: true,
    secure: config.cookieOptions.secure,
    sameSite: config.cookieOptions.sameSite as "strict" | "lax" | "none",
    path: config.cookieOptions.path,
    ...(config.cookieOptions.domain ? { domain: config.cookieOptions.domain } : {}),
  };

  response.cookies.set(config.cookieNames.accessToken, accessToken, {
    ...baseOptions,
    ...(accessExpiry > 0 ? { maxAge: accessExpiry } : {}),
  });

  response.cookies.set(config.cookieNames.refreshToken, refreshToken, {
    ...baseOptions,
    ...(refreshExpiry > 0 ? { maxAge: refreshExpiry } : {}),
  });
}

function clearTokensFromResponse(response: NextResponse, config: ResolvedAuthConfig): void {
  response.cookies.set(config.cookieNames.accessToken, "", { maxAge: 0 });
  response.cookies.set(config.cookieNames.refreshToken, "", { maxAge: 0 });
}

/**
 * Returns an async middleware resolver function.
 * Call this once per middleware invocation to get the session state.
 *
 * The resolver automatically handles token refresh — if the access token
 * is expired or close to expiry, it calls `adapter.refreshToken()` and
 * returns the new tokens. Always use `session.response()` to write them to cookies.
 *
 * @param config - Optional resolved auth config. When omitted, falls back to
 *   the module-level singleton (`getGlobalAuthConfig()`). Pass explicitly when
 *   multiple `Auth()` instances coexist (e.g. C端 `auth` + admin `adminAuth`)
 *   so the resolver reads the correct cookie names and uses the correct adapter.
 *
 * @returns An async function `(request: NextRequest) => Promise<AuthMiddlewareResult>`.
 *
 * @example
 * // middleware.ts
 * const resolveAuth = auth.createMiddleware();
 * const session = await resolveAuth(request);
 * if (!session.isAuthenticated) return session.redirect(new URL("/login", request.url));
 * return session.response(NextResponse.next());
 */
export function createAuthMiddleware(config?: ResolvedAuthConfig) {
  return async function resolveAuth(request: NextRequest): Promise<AuthMiddlewareResult> {
    const resolvedConfig = config ?? getGlobalAuthConfig();
    const { pathname } = request.nextUrl;

    let accessToken = request.cookies.get(resolvedConfig.cookieNames.accessToken)?.value ?? null;
    const refreshToken =
      request.cookies.get(resolvedConfig.cookieNames.refreshToken)?.value ?? null;

    let refreshedTokens: { accessToken: string; refreshToken: string } | null = null;
    let refreshRejected = false;

    if (!accessToken && !refreshToken) {
      debugLog("Middleware: no tokens found", { pathname });
    }

    // Refresh if: no access token, expired, or within the refresh threshold
    const secondsRemaining = accessToken ? getSecondsUntilExpiry(accessToken) : 0;
    const needsRefresh =
      !accessToken ||
      !isTokenValid(accessToken) ||
      secondsRemaining <= resolvedConfig.refreshThresholdSeconds;

    if (needsRefresh && refreshToken && isTokenValid(refreshToken)) {
      debugLog("Middleware: access token needs refresh — attempting", {
        pathname,
        reason: !accessToken
          ? "no access token"
          : !isTokenValid(accessToken)
            ? "access token expired"
            : `within threshold (${secondsRemaining}s remaining)`,
      });

      // Dedup concurrent refresh calls for the same refresh_token: refresh
      // token rotation revokes the old token on each refresh, so without
      // dedup, concurrent requests (navigation + prefetch) would each fire
      // an independent refresh and all but one would fail.
      try {
        refreshedTokens = await dedupServerRefresh(refreshToken, () =>
          resolvedConfig.adapter.refreshToken(refreshToken),
        );
        accessToken = refreshedTokens.accessToken;
        debugLog("Middleware: token refresh successful", { pathname });
      } catch (error) {
        // 刷新失败：区分「后端明确拒绝」（401/403，refresh_token 已撤销/无效，
        // 会话确定性失效）与「瞬时故障」（5xx/429/网络/超时，可重试，不应清
        // cookie）。isDefinitiveRejection 与 refresh 路由共用同一契约
        // （见 ../types）；isApiStatusError 用鸭子类型判定，免疫 dev 模式下
        // 模块多实例导致的 instanceof 失真。
        refreshRejected = isDefinitiveRejection(error);
        debugLog("Middleware: token refresh failed — proceeding with existing state", {
          pathname,
          status: isApiStatusError(error) ? error.status : null,
          refreshRejected,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const isAuthenticated = accessToken ? isTokenValid(accessToken) : false;

    debugLog("Middleware: resolved", { pathname, isAuthenticated });

    function response(base: NextResponse): NextResponse {
      if (refreshedTokens) {
        writeTokensToResponse(
          base,
          refreshedTokens.accessToken,
          refreshedTokens.refreshToken,
          resolvedConfig,
        );
      }
      return base;
    }

    function redirect(url: URL): NextResponse {
      // 会话确定性失效（无 refresh_token / 本地已过期 / 后端明确拒绝）才清
      // cookie；瞬时刷新失败保留 cookie，让后续请求（含 Server Component
      // 401 → refresh 路由兜底）仍可恢复会话。
      const sessionDead =
        !refreshToken || !isTokenValid(refreshToken) || refreshRejected;
      debugLog("Middleware: redirecting", {
        pathname,
        destination: url.pathname,
        clearCookies: sessionDead,
      });
      const redirectResponse = NextResponse.redirect(url);
      if (sessionDead) {
        clearTokensFromResponse(redirectResponse, resolvedConfig);
      }
      return redirectResponse;
    }

    return {
      isAuthenticated,
      accessToken,
      refreshToken: refreshedTokens?.refreshToken ?? refreshToken,
      refreshRejected,
      response,
      redirect,
    };
  };
}
