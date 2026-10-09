// Pure helper (no server-only import) so it can be unit-tested without creating a database client.

/**
 * Neon URLs use sslmode=require. The pg driver currently treats that as verify-full and warns that its next major
 * version will weaken it, so we ask for verify-full explicitly: same behaviour today, no surprise downgrade later.
 * URLs without sslmode (local Docker, CI) are returned unchanged.
 */
export function withStrictSsl(connectionString: string): string {
  const url = new URL(connectionString);
  const mode = url.searchParams.get("sslmode");
  if (mode && ["prefer", "require", "verify-ca"].includes(mode) && !url.searchParams.has("uselibpqcompat")) {
    url.searchParams.set("sslmode", "verify-full");
  }
  return url.toString();
}
