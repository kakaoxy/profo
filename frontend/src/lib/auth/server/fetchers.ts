import { redirect } from "next/navigation";
import type { ResolvedAuthConfig, Session } from "../types";
import { getSession } from "./session";
import { getGlobalAuthConfig } from "../config";

/**
 * Runs a callback with the current session if one exists.
 * Returns `null` (or `defaultValue`) if the user is not authenticated.
 *
 * @param callback - Function to run with the resolved session.
 * @param defaultValue - Optional fallback returned when there is no session. Defaults to `null`.
 * @param config - Optional resolved auth config. When omitted, falls back to the
 *   module-level singleton. Pass explicitly when multiple `Auth()` instances coexist.
 * @returns The callback's return value, or `defaultValue` / `null` if unauthenticated.
 *
 * @example
 * const data = await auth.withSession((session) => fetchUserData(session.accessToken));
 */
export async function withSession<TResult>(
  callback: (session: Session) => TResult | Promise<TResult>,
  defaultValue?: TResult,
  config?: ResolvedAuthConfig,
): Promise<TResult | null> {
  const session = await getSession(config);
  if (!session) {
    return defaultValue !== undefined ? defaultValue : null;
  }
  return callback(session);
}

/**
 * Runs a callback with the current session, or redirects to the sign-in page.
 * Use in Server Components or server actions where authentication is required.
 *
 * @param callback - Function to run with the resolved session.
 * @param config - Optional resolved auth config (see {@link withSession}).
 * @returns The callback's return value.
 * @throws Always throws Next.js's `NEXT_REDIRECT` error when unauthenticated.
 *
 * @example
 * const data = await auth.withRequiredSession((session) => fetchProfile(session.user.id));
 */
export async function withRequiredSession<TResult>(
  callback: (session: Session) => TResult | Promise<TResult>,
  config?: ResolvedAuthConfig,
): Promise<TResult> {
  const resolvedConfig = config ?? getGlobalAuthConfig();
  const session = await getSession(resolvedConfig);
  if (!session) redirect(resolvedConfig.pages.signIn);
  return callback(session);
}
