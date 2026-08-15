"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import {
  fetchSessionAction,
  loginAction,
  logoutAction,
  updateSessionTokenAction,
} from "../server/actions";
import type {
  ClientSession,
  ClientSessionData,
  ActionResult,
  LoginActionOptions,
  SessionActionData,
  OAuthProviderId,
} from "../types";

// ─── AuthActions ──────────────────────────────────────────────────────────────

export interface AuthActions {
  login(
    credentials: Record<string, unknown>,
    options?: LoginActionOptions,
  ): Promise<ActionResult<SessionActionData>>;
  logout(options?: { redirect?: boolean; callbackUrl?: string }): Promise<ActionResult<null>>;
  /** Syncs client session state. Silently rotates tokens if expired before returning. */
  fetchSession(): Promise<ActionResult<SessionActionData | null>>;
  /** Manually update the access token stored in the HTTP-only cookie */
  updateSessionToken(newAccessToken: string): Promise<ActionResult<SessionActionData>>;
}

// ─── Context ──────────────────────────────────────────────────────────────────

interface AuthContextValue {
  session: ClientSession;
  login: AuthActions["login"];
  logout: AuthActions["logout"];
  fetchSession: AuthActions["fetchSession"];
  updateSessionToken: AuthActions["updateSessionToken"];
  /** Whether OAuth providers are configured. Passed from the Server Component layout. */
  hasOAuth: boolean;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

// ─── Helpers ──────────────────────────────────────────────────────────────────

const LOADING_SESSION: ClientSession = {
  status: "loading",
  user: null,
};

const UNAUTHENTICATED: ClientSession = {
  status: "unauthenticated",
  user: null,
};

function buildAuthenticatedState(data: SessionActionData): ClientSession {
  return {
    status: "authenticated",
    user: data.user,
  };
}

/**
 * Derives the correct initial client session state from the `initialSession` prop.
 *
 * Three cases:
 *   - `undefined` (prop not passed) → "loading". The provider will fetch the
 *     session from the server on mount. This is the no-SSR path.
 *   - `null` (explicitly passed from a server component that found no session)
 *     → "unauthenticated". No fetch needed — the server already checked.
 *   - `Session` object → "authenticated". No fetch needed — hydrate immediately.
 *
 * The distinction between `undefined` and `null` is intentional:
 *   - `undefined` means "I didn't check" → client must check.
 *   - `null`      means "I checked and there is no session" → trust the server.
 */
function buildInitialState(initialSession: ClientSessionData | null | undefined): ClientSession {
  if (initialSession === undefined) return LOADING_SESSION;
  if (initialSession === null) return UNAUTHENTICATED;
  return buildAuthenticatedState(initialSession);
}

// ─── AuthProvider ─────────────────────────────────────────────────────────────

export interface AuthProviderProps {
  children: React.ReactNode;
  /**
   * The server-side session passed from your root layout.
   *
   * - Pass the result of `await auth.getSession()` to hydrate instantly with
   *   no client-side fetch and no loading flicker.
   * - Pass `null` explicitly if you know the user is unauthenticated on the
   *   server — skips the client fetch.
   * - Omit entirely (or pass `undefined`) to let the client fetch the session
   *   on mount. The session will start as "loading" until the fetch completes.
   *
   * @example
   * // app/layout.tsx — recommended: pass session from server
   * const session = await auth.getSession();
   * <AuthProvider initialSession={session} actions={auth.actions}>
   *
   * // Client-only apps — omit initialSession, the client will fetch on mount
   * <AuthProvider actions={auth.actions}>
   */
  initialSession?: ClientSessionData | null;
  /**
   * The server actions object from `auth.actions`.
   *
   * Optional — when omitted, the provider uses the server actions imported
   * directly from `../server/actions`. This is the recommended mode for
   * Turbopack compatibility (ensures actions are registered in the
   * server-reference-manifest).
   *
   * Pass explicitly only for testing (to inject mocks).
   */
  actions?: AuthActions;
  /**
   * Called when a session silently expires — i.e., a background refresh or
   * revalidation fails and the user was previously authenticated.
   *
   * NOT called when the user explicitly calls logout().
   * NOT called during the initial mount fetch that finds no session.
   *
   * @example
   * <AuthProvider onSessionExpired={() => toast.error("Your session expired.")} ...>
   */
  onSessionExpired?: () => void;
  /**
   * Whether to revalidate the session when the browser tab regains focus.
   * Defaults to `true`. Set to `false` to disable.
   *
   * When revalidation finds an expired session for a previously-authenticated
   * user, `onSessionExpired` is called if provided.
   */
  refreshOnFocus?: boolean;
  /**
   * Whether OAuth providers are configured. Passed from the Server Component
   * layout (which has access to `auth.config.providers`) so the client does
   * not need to read the server-only global config.
   *
   * Defaults to `false`. Set to `true` when OAuth providers are registered.
   */
  hasOAuth?: boolean;
}

/**
 * Wraps your app and provides session state + auth actions to all client components.
 *
 * ── Session initialisation ────────────────────────────────────────────────────
 *
 * Pass `initialSession` from a Server Component for instant hydration with no
 * loading state. If omitted, the provider starts in "loading" and fetches the
 * session from the server on mount.
 *
 * ── Features ──────────────────────────────────────────────────────────────────
 *
 * Refresh on focus: when a tab regains visibility, the session is revalidated.
 * Configurable via `refreshOnFocus` (default: true).
 *
 * Session expiry callback: supply `onSessionExpired` to be notified when a
 * background revalidation fails for a previously-authenticated user.
 *
 * @example
 * // app/layout.tsx
 * import { auth } from "@/auth";
 * import { AuthProvider } from "@/lib/auth/client";
 *
 * export default async function RootLayout({ children }) {
 *   const session = await auth.getSession();
 *   return (
 *     <html><body>
 *       <AuthProvider
 *         actions={auth.actions}
 *         initialSession={session}
 *         onSessionExpired={() => toast.error("Session expired")}
 *       >
 *         {children}
 *       </AuthProvider>
 *     </body></html>
 *   );
 * }
 */
export function AuthProvider({
  children,
  initialSession,
  actions,
  onSessionExpired,
  refreshOnFocus = true,
  hasOAuth = false,
}: AuthProviderProps) {
  // Default to the directly-imported server actions. This ensures Turbopack
  // registers them in the server-reference-manifest (actions passed via props
  // from a Server Component through an intermediate object are not tracked by
  // Turbopack's static analysis). The `actions` prop is kept for testing.
  const resolvedActions = useMemo<AuthActions>(
    () =>
      actions ?? {
        login: loginAction,
        logout: logoutAction,
        fetchSession: fetchSessionAction,
        updateSessionToken: updateSessionTokenAction,
      },
    [actions],
  );

  const [session, setSession] = useState<ClientSession>(() => buildInitialState(initialSession));

  const router = useRouter();

  // ── Stable refs ──────────────────────────────────────────────────────────────
  // Keep refs in sync so effects/callbacks never close over stale values.

  const onSessionExpiredRef = useRef(onSessionExpired);
  useEffect(() => {
    onSessionExpiredRef.current = onSessionExpired;
  }, [onSessionExpired]);

  const actionsRef = useRef(resolvedActions);
  useEffect(() => {
    actionsRef.current = resolvedActions;
  }, [resolvedActions]);

  const sessionRef = useRef(session);
  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  // ── Mount fetch ──────────────────────────────────────────────────────────────
  // Only runs when `initialSession` was not provided (undefined). In that case
  // the initial state is "loading" and we need to ask the server for the session.
  //
  // If `initialSession` was explicitly passed (null or Session object), the server
  // already resolved the state — skip the fetch entirely.
  useEffect(() => {
    if (initialSession !== undefined) return;

    let cancelled = false;

    async function fetchOnMount() {
      const result = await actionsRef.current.fetchSession();

      if (cancelled) return;

      if (!result.success || !result.data) {
        setSession(UNAUTHENTICATED);
        // Do NOT call onSessionExpired here. The user was never authenticated
        // in this session — "no session found on mount" is normal, not an expiry.
      } else {
        setSession(buildAuthenticatedState(result.data));
      }
    }

    fetchOnMount().catch(() => {
      if (!cancelled) setSession(UNAUTHENTICATED);
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally empty — runs exactly once on mount

  // ── Refresh on focus ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!refreshOnFocus) return;

    const handleVisibilityChange = async () => {
      // Only revalidate when the tab becomes visible and we have an established
      // authenticated session. Skip during loading and for unauthenticated users
      // to avoid unnecessary network requests.
      if (document.visibilityState !== "visible" || sessionRef.current.status !== "authenticated") {
        return;
      }

      const wasAuthenticated = sessionRef.current.status === "authenticated";
      const result = await actionsRef.current.fetchSession();

      if (!result.success || !result.data) {
        setSession(UNAUTHENTICATED);
        // Only refresh RSCs / fire the expiry callback when the session
        // actually transitioned from authenticated → unauthenticated. Calling
        // router.refresh() on every successful revalidation causes unnecessary
        // RSC re-renders and conflicts with SWR's revalidateOnFocus: false.
        if (wasAuthenticated) {
          onSessionExpiredRef.current?.();
          // Re-run server components so middleware and requireSession() guards
          // can act on the expired session (redirect away from protected pages).
          router.refresh();
        }
      } else {
        setSession(buildAuthenticatedState(result.data));
        // Session is still valid — no need to re-render server components.
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [refreshOnFocus, router]);

  // ── Auth callbacks ───────────────────────────────────────────────────────────

  const login = useCallback<AuthActions["login"]>(
    async (credentials, options) => {
      const result = await resolvedActions.login(credentials, options);
      if (result.success) {
        setSession(buildAuthenticatedState(result.data));
      }
      return result;
    },
    [resolvedActions],
  );

  const logout = useCallback<AuthActions["logout"]>(
    async (options) => {
      // Optimistically clear local state for instant UI response.
      setSession(UNAUTHENTICATED);
      return resolvedActions.logout(options);
    },
    [resolvedActions],
  );

  const fetchSession = useCallback<AuthActions["fetchSession"]>(async () => {
    const result = await resolvedActions.fetchSession();
    if (!result.success || !result.data) {
      const wasAuthenticated = sessionRef.current.status === "authenticated";
      setSession(UNAUTHENTICATED);
      // Only fire onSessionExpired if the user had an active session —
      // avoids calling it during normal unauthenticated revalidations.
      if (wasAuthenticated) {
        onSessionExpiredRef.current?.();
      }
    } else {
      setSession(buildAuthenticatedState(result.data));
    }
    return result;
  }, [resolvedActions]);

  const updateSessionToken = useCallback<AuthActions["updateSessionToken"]>(
    async (newAccessToken) => {
      const result = await resolvedActions.updateSessionToken(newAccessToken);
      if (result.success) {
        setSession(buildAuthenticatedState(result.data));
        router.refresh(); // Refresh Server Components so they get the new token
      }
      return result;
    },
    [resolvedActions, router],
  );

  const contextValue = useMemo<AuthContextValue>(
    () => ({ session, login, logout, fetchSession, updateSessionToken, hasOAuth }),
    [session, login, logout, fetchSession, updateSessionToken, hasOAuth],
  );

  return <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>;
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

/**
 * Returns the current client-side session.
 * Must be called inside a component wrapped by <AuthProvider>.
 *
 * Always check `session.status` before accessing `session.user`:
 *   - "loading"         — session is being fetched, render a skeleton/spinner
 *   - "authenticated"   — session.user is available
 *   - "unauthenticated" — no session exists
 *
 * @example
 * const session = useSession();
 * if (session.status === "loading") return <Spinner />;
 * if (session.status === "unauthenticated") return <LoginPrompt />;
 * return <p>Hello, {session.user.email}</p>;
 */
export function useSession(): ClientSession {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error(
      "[next-jwt-auth] useSession() was called outside of <AuthProvider>.\n" +
        "Wrap your app in <AuthProvider> in your root layout.",
    );
  }
  return ctx.session;
}

/**
 * Return type of {@link useAuth}.
 *
 * `oauthLogin` is OPTIONAL: it is only present when OAuth providers are
 * configured via `Auth({ providers: [...] })`. When no providers are
 * registered, `oauthLogin` is `undefined` so consumers cannot trigger a
 * redirect to a non-existent `/api/auth/:id/login` endpoint (the OAuth
 * route handlers are stubs until OAuth is enabled).
 */
export interface UseAuthReturn {
  login: AuthActions["login"];
  logout: AuthActions["logout"];
  fetchSession: AuthActions["fetchSession"];
  updateSessionToken: AuthActions["updateSessionToken"];
  /**
   * Initiates an OAuth login flow by redirecting to the provider's login endpoint.
   * Only present when OAuth providers are configured in `Auth()`.
   *
   * @example
   * const { oauthLogin } = useAuth();
   * if (oauthLogin) oauthLogin("google");
   * // or with a callbackUrl:
   * if (oauthLogin) oauthLogin("github", { callbackUrl: "/dashboard" });
   */
  oauthLogin?: (providerId: OAuthProviderId, options?: { callbackUrl?: string }) => void;
}

/**
 * Returns auth action handlers.
 * Must be called inside a component wrapped by `<AuthProvider>`.
 *
 * Loading state is intentionally not included — wrap calls in your own
 * `useTransition()` or `useState` to track pending state where you need it.
 *
 * `oauthLogin` is only included when OAuth providers are configured via
 * `Auth()`; otherwise it is `undefined`.
 *
 * @returns Object with:
 *   - `login(credentials, options?)` — calls the login action and updates session state.
 *   - `logout(options?)` — optimistically clears session state and calls the logout action.
 *   - `fetchSession()` — manually re-fetches the session from the server.
 *   - `updateSessionToken(newAccessToken)` — syncs a new access token into the HTTP-only cookie.
 *   - `oauthLogin?(providerId, options?)` — initiates an OAuth login redirect. Only when OAuth providers are configured.
 *
 * @example
 * const { login, logout } = useAuth();
 *
 * // Login honouring the callbackUrl from the current URL
 * await login({ email, password }, { callbackUrl: searchParams.get("callbackUrl") });
 *
 * // Disable redirect — handle navigation yourself
 * const result = await login({ email, password }, { redirect: false });
 * if (result.success) router.push("/dashboard");
 *
 * // Logout with default redirect
 * await logout();
 *
 * // Logout without redirect
 * const result = await logout({ redirect: false });
 * if (result.success) router.replace("/");
 */
export function useAuth(): UseAuthReturn {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error(
      "[next-jwt-auth] useAuth() was called outside of <AuthProvider>.\n" +
        "Wrap your app in <AuthProvider> in your root layout.",
    );
  }

  // Only expose oauthLogin when OAuth providers are registered via Auth().
  // Without this guard, calling oauthLogin("google", ...) would redirect to
  // /api/auth/google/login — a stub endpoint that does not exist (404).
  const hasOAuth = ctx.hasOAuth;

  const oauthLogin = (providerId: OAuthProviderId, options?: { callbackUrl?: string }) => {
    const base = `/api/auth/${providerId}/login`;
    const url = options?.callbackUrl
      ? `${base}?callbackUrl=${encodeURIComponent(options.callbackUrl)}`
      : base;
    window.location.href = url;
  };

  return {
    login: ctx.login,
    logout: ctx.logout,
    fetchSession: ctx.fetchSession,
    updateSessionToken: ctx.updateSessionToken,
    ...(hasOAuth ? { oauthLogin } : {}),
  };
}
