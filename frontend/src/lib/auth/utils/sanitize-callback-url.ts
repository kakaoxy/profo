import { debugLog } from "../config";

/**
 * Validates a callbackUrl to prevent open-redirect attacks.
 * Only root-relative paths (starting with "/" but not "//") are allowed.
 * Any other value — absolute URLs, protocol-relative URLs, empty strings —
 * is rejected and returns undefined, falling back to pages.home.
 */
export function sanitizeCallbackUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  // Allow root-relative paths only — blocks `//evil.com` and `https://evil.com`
  if (url.startsWith("/") && !url.startsWith("//")) return url;
  debugLog("sanitizeCallbackUrl: rejected unsafe callbackUrl", { url });
  return undefined;
}
