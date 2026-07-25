// ⚠️  SERVER-ONLY — DO NOT IMPORT THIS FILE IN CLIENT COMPONENTS
//
// This is the main entry point for the library. It exports the Auth() factory
// and all server-side utilities. Client-side usage goes through:
//   import { AuthProvider, useSession, useAuth } from "@/lib/auth/client"

import type { AuthActions, AuthConfig } from "./types";
import { createAuthConfig } from "./core/config";
import { setGlobalAuthConfig } from "./config";
import {
  getSession,
  getUser,
  getAccessToken,
  getRefreshToken,
  requireSession,
} from "./server/session";
import { withSession, withRequiredSession } from "./server/fetchers";
import {
  createAuthMiddleware,
  matchesPath,
} from "./middleware/auth-middleware";
import { fetchSessionAction, loginAction, logoutAction, updateSessionTokenAction } from "./server/actions";
import { createOAuthHandler } from "./handlers";

/**
 * Initializes the auth library with your adapter and configuration.
 *
 * Call this once in `auth.ts` at your project root. The resolved config is
 * stored in a module-level singleton so every internal module can access it
 * without prop drilling.
 *
 * **Multiple instances:** When two `Auth()` instances coexist in the same
 * Node process (e.g. C端 `auth.ts` + admin `admin-auth.ts`), the singleton
 * holds whichever was loaded last. To avoid this conflict, all returned
 * helpers (`getSession`, `getUser`, `createMiddleware`, ...) capture their
 * own `resolved` config via closure and pass it explicitly to the underlying
 * server/middleware functions. The singleton is kept only for backward
 * compatibility with the bundled server actions in `actions` (used by
 * `<AuthProvider>`) — admin code should NOT use `adminAuth.actions.*` and
 * should instead call `adminAuth.adapter.*` + `setTokenCookies` directly.
 *
 * @param config - Your auth configuration: adapter (required), plus optional
 *   cookies, refresh, pages, debug, and providers settings.
 * @returns An object containing:
 *   - `getSession`, `getUser`, `getAccessToken`, `getRefreshToken`, `requireSession` — server session helpers
 *   - `withSession`, `withRequiredSession` — fetch utilities
 *   - `createMiddleware`, `matchesPath` — middleware factory and path matcher
 *   - `handlers` — `{ GET }` for the OAuth catch-all route handler
 *   - `config` — the resolved configuration object
 *   - `actions` — bundled server actions to pass to `<AuthProvider>` (singleton-based, C端 only)
 *
 * @example
 * // auth.ts
 * import { Auth } from "@/lib/auth";
 *
 * export const auth = Auth({
 *   adapter: {
 *     async login(credentials) { ... },
 *     async refreshToken(token) { ... },
 *     async fetchUser(accessToken) { ... },
 *   },
 *   debug: process.env.NODE_ENV === "development",
 * });
 */
export function Auth(config: AuthConfig) {
  const resolved = createAuthConfig(config);

  // Backward compat: store in the module-level singleton so the bundled
  // server actions in `actions` (which still call `getGlobalAuthConfig()`
  // because "use server" exports cannot be closures) continue to work for
  // the C端 auth instance. Instance-bound helpers below prefer the captured
  // `resolved` config and never read from the singleton.
  setGlobalAuthConfig(resolved);

  return {
    // ── Server-side session helpers ────────────────────────────────────────
    // Each helper is bound to `resolved` via closure so multiple `Auth()`
    // instances do not collide via the singleton.
    /** Returns the current session, or null if unauthenticated. */
    getSession: () => getSession(resolved),
    /** Returns the current user, or null if unauthenticated. */
    getUser: () => getUser(resolved),
    /** Returns the current access token, or null if unauthenticated. */
    getAccessToken: () => getAccessToken(resolved),
    /** Returns the current refresh token, or null if unauthenticated. */
    getRefreshToken: () => getRefreshToken(resolved),
    /** Returns the current session, or redirects to the sign-in page. */
    requireSession: (options?: { includeCallbackUrl?: boolean }) =>
      requireSession(options, resolved),

    // ── Fetch utilities ────────────────────────────────────────────────────
    /** Run a callback with the session if it exists, otherwise return null. */
    withSession: <TResult>(
      callback: Parameters<typeof withSession<TResult>>[0],
      defaultValue?: TResult,
    ) => withSession<TResult>(callback, defaultValue, resolved),
    /** Run a callback with the session, or redirect to sign-in. */
    withRequiredSession: <TResult>(
      callback: Parameters<typeof withRequiredSession<TResult>>[0],
    ) => withRequiredSession<TResult>(callback, resolved),
    // ── Middleware ─────────────────────────────────────────────────────────
    /**
     * Returns a middleware resolver function bound to this instance's config.
     * Use in middleware.ts: `const resolveAuth = auth.createMiddleware();`
     */
    createMiddleware: () => createAuthMiddleware(resolved),
    /** Returns true if pathname matches any of the given path patterns. */
    matchesPath,

    // ── OAuth Route Handlers ───────────────────────────────────────────────
    /**
     * Next.js Route Handler for OAuth flows.
     * Export as `export const { GET } = auth.handlers` in your catch-all route:
     *   `app/api/auth/[...oauth]/route.ts`
     *
     * Handles `/api/auth/[provider]/login` and `/api/auth/[provider]/callback`.
     * Before OAuth is configured this handler throws — run
     * `npx @smittdev/next-jwt-auth add oauth` to replace it with the real implementation.
     */
    handlers: {
      GET: createOAuthHandler(),
    },

    // ── Config ─────────────────────────────────────────────────────────────
    /** The resolved configuration object (rarely needed directly). */
    config: resolved,
    /**
     * Direct access to the configured adapter. Admin code (Server Actions,
     * Route Handlers, token refresh utilities) uses this to call the backend
     * directly without going through the singleton-bound `actions` bundle:
     *   const tokens = await adminAuth.adapter.login(credentials);
     *   await setTokenCookies(tokens, adminAuth.config);
     */
    adapter: resolved.adapter,

    // ── Server Actions ─────────────────────────────────────────────────────
    // ⚠️  These are the bare server actions from `server/actions.ts`, which
    // internally call `getGlobalAuthConfig()`. They are therefore tied to the
    // singleton and ONLY correct for the C端 auth instance (the one passed to
    // `<AuthProvider actions={auth.actions}>` in the C端 root layout).
    //
    // Admin code must NOT use `adminAuth.actions.*` — when both `auth.ts`
    // and `admin-auth.ts` are loaded, the singleton reflects whichever was
    // imported last, so `adminAuth.actions.login` would silently use the
    // C端 config (wrong cookie names, wrong adapter endpoints). Admin should
    // instead call `adminAuth.adapter.*` + `setTokenCookies(tokens, adminAuth.config)`
    // directly from its own "use server" action files.
    actions: {
      login: loginAction,
      logout: logoutAction,
      fetchSession: fetchSessionAction,
      updateSessionToken: updateSessionTokenAction,
    } satisfies AuthActions,
  };
}

// ─── Re-exports ───────────────────────────────────────────────────────────────
// These let consumers do:  import type { SessionUser } from "@/lib/auth"

export type {
  AuthConfig,
  AuthAdapter,
  AuthPages,
  CookieOptions,
  RefreshOptions,
  Session,
  SessionUser,
  TokenPair,
  ClientSession,
  SessionStatus,
  ActionResult,
  SessionActionData,
  AuthActions,
  LoginActionOptions,
  OAuthUserInfo,
  OAuthProvider,
  OAuthProviderId,
} from "./types";
