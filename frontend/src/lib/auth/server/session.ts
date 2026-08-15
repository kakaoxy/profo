import { cache } from "react";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getTokensFromCookies, isTokenValid } from "../core";
import type { ResolvedAuthConfig, Session, SessionUser } from "../types";
import { getGlobalAuthConfig, debugLog } from "../config";

/**
 * Module-level cached resolver. React's `cache()` deduplicates this per request,
 * so calling `getSession()` multiple times in one render tree costs exactly one
 * cookie read and one adapter.fetchUser() call.
 *
 * The `config` argument is part of the cache key — when multiple `Auth()`
 * instances coexist (e.g. C端 `auth` + admin `adminAuth` in the same Node
 * process), each instance's stable `resolved` config object gets its own cache
 * entry, preventing cross-instance session leakage.
 *
 * Intentionally does NOT refresh tokens or write cookies — that is handled by
 * the middleware before the request reaches this point. Attempting to set cookies
 * during page rendering throws in Next.js (only allowed in Server Actions /
 * Route Handlers).
 */
const resolveSession = cache(async (config: ResolvedAuthConfig): Promise<Session | null> => {
  const tokens = await getTokensFromCookies(config);

  if (!tokens) {
    debugLog("resolveSession: no tokens found in cookies");
    return null;
  }

  const { accessToken, refreshToken } = tokens;

  // If the access token is invalid here, the middleware either could not refresh
  // (e.g. refresh token also expired) or is not running on this route.
  // Either way, treat it as no session — do not attempt to set cookies.
  if (!isTokenValid(accessToken)) {
    debugLog("resolveSession: access token is invalid or expired — treating as no session");
    return null;
  }

  try {
    const user = await config.adapter.fetchUser(accessToken);
    debugLog("resolveSession: session resolved", { userId: user.id });
    return { accessToken, refreshToken, user };
  } catch (error) {
    debugLog("resolveSession: adapter.fetchUser() threw — treating as no session", {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
});

/**
 * Returns the current session, or null if the user is not authenticated.
 * Safe to call in any Server Component, layout, or server action.
 * Results are deduplicated per request via React cache().
 *
 * @param config - Optional resolved auth config. When omitted, falls back to
 *   the module-level singleton (`getGlobalAuthConfig()`). Pass explicitly when
 *   multiple `Auth()` instances coexist (e.g. admin + C端) to avoid the
 *   singleton being overwritten by the most recently loaded instance.
 */
export async function getSession(config?: ResolvedAuthConfig): Promise<Session | null> {
  return resolveSession(config ?? getGlobalAuthConfig());
}

/**
 * Returns the current access token directly from cookies.
 * Does NOT call fetchUser — use getSession() if you need the full session.
 *
 * @param config - Optional resolved auth config (see {@link getSession}).
 * @returns The raw access token string, or `null` if no valid token exists in cookies.
 */
export async function getAccessToken(config?: ResolvedAuthConfig): Promise<string | null> {
  const resolvedConfig = config ?? getGlobalAuthConfig();
  const tokens = await getTokensFromCookies(resolvedConfig);
  if (!tokens || !isTokenValid(tokens.accessToken)) return null;
  return tokens.accessToken;
}

/**
 * Returns the current refresh token directly from cookies.
 * Does NOT call fetchUser — use getSession() if you need the full session.
 *
 * @param config - Optional resolved auth config (see {@link getSession}).
 * @returns The raw refresh token string, or `null` if the refresh token cookie is absent.
 */
export async function getRefreshToken(config?: ResolvedAuthConfig): Promise<string | null> {
  const resolvedConfig = config ?? getGlobalAuthConfig();
  const tokens = await getTokensFromCookies(resolvedConfig);
  return tokens?.refreshToken ?? null;
}

/**
 * Returns the current user, or null if not authenticated.
 *
 * @param config - Optional resolved auth config (see {@link getSession}).
 */
export async function getUser(config?: ResolvedAuthConfig): Promise<SessionUser | null> {
  const session = await resolveSession(config ?? getGlobalAuthConfig());
  return session?.user ?? null;
}

/**
 * Returns the current session, or redirects to the sign-in page if not authenticated.
 * Use this as a server-side guard in protected pages and layouts.
 *
 * When `includeCallbackUrl` is true (default), the current path is appended
 * as a `?redirect=` search param so your login page can redirect back
 * after a successful login. 参数名与 proxy.ts 保持一致（统一为 `redirect`）。
 *
 * @param options.includeCallbackUrl - Append the current path as `?redirect=` to the redirect. Defaults to `true`.
 * @param config - Optional resolved auth config (see {@link getSession}).
 * @returns The current `Session` object (guaranteed non-null).
 * @throws Always throws Next.js's internal `NEXT_REDIRECT` error when unauthenticated —
 *         this is the standard mechanism for Next.js page redirects and must not be caught.
 *
 * @example
 * // app/dashboard/page.tsx
 * const session = await auth.requireSession();
 * // session is guaranteed non-null here
 */
export async function requireSession(
  options: { includeCallbackUrl?: boolean } = {},
  config?: ResolvedAuthConfig,
): Promise<Session> {
  const { includeCallbackUrl = true } = options;
  const resolvedConfig = config ?? getGlobalAuthConfig();
  const session = await resolveSession(resolvedConfig);

  if (!session) {
    if (includeCallbackUrl) {
      try {
        const headersList = await headers();
        const currentPath = headersList.get("x-pathname") ?? headersList.get("x-invoke-path") ?? "";
        if (currentPath) {
          debugLog("requireSession: unauthenticated — redirecting with redirect param", {
            signIn: resolvedConfig.pages.signIn,
            redirect: currentPath,
          });
          redirect(`${resolvedConfig.pages.signIn}?redirect=${encodeURIComponent(currentPath)}`);
        }
      } catch (error) {
        if (isRedirectError(error)) throw error;
      }
    }

    debugLog("requireSession: unauthenticated — redirecting to signIn", {
      signIn: resolvedConfig.pages.signIn,
    });
    redirect(resolvedConfig.pages.signIn);
  }

  return session;
}

/**
 * Checks if an error is the special NEXT_REDIRECT internal error.
 *
 * Task 8: 导出供 Server Component 数据获取层（layout.tsx / dashboard-data.ts /
 * market-data.ts 等）在 try/catch 与 Promise.allSettled 中识别并放行 redirect
 * 错误。`fetchClient` 在 Server Component 上下文遇到 401 时会调用
 * `redirect("/api/auth/refresh?next=...")` 抛出 NEXT_REDIRECT，若被上层 catch
 * 吞掉则跳转不会触发，用户会看到空数据或被误判为未登录。
 */
export function isRedirectError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    typeof (error as Record<string, unknown>).digest === "string" &&
    ((error as Record<string, unknown>).digest as string).startsWith("NEXT_REDIRECT")
  );
}
