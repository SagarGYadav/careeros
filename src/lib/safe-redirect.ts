export const DEFAULT_SIGNED_IN_PATH = "/overview";

/**
 * Returns a same-site path to redirect to after sign-in, or the fallback.
 * Rejects absolute URLs and protocol-relative paths ("//evil.com", "/\evil.com") to prevent open redirects.
 */
export function safeRedirectPath(value: string | null | undefined, fallback = DEFAULT_SIGNED_IN_PATH): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) {
    return fallback;
  }
  return value;
}
