// SSRF guard (SPEC §23): a URL the user gives is fetched by the server, so it must not reach the server's own
// network. Only http(s) on the default ports, no credentials, no internal names, and every address the name
// resolves to must be public. LinkedIn and Naukri are never fetched (CLAUDE.md rule 8).

export const NEVER_FETCH = [/(^|\.)linkedin\.com$/i, /(^|\.)naukri\.com$/i];

export type UrlCheck = { ok: true; url: URL } | { ok: false; reason: string };

export function checkUrl(raw: string): UrlCheck {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return { ok: false, reason: "That isn't a web address." };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:")
    return { ok: false, reason: "Only http and https links work." };
  if (url.username || url.password) return { ok: false, reason: "Links with a user name or password aren't allowed." };
  if (url.port && url.port !== "80" && url.port !== "443")
    return { ok: false, reason: "Only standard web ports are allowed." };
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!host.includes(".") || /\.(local|localhost|internal|lan|home|corp)$/.test(host) || host === "localhost") {
    return { ok: false, reason: "That address points to a private network." };
  }
  if (isIpLiteral(host) && !isPublicIp(host)) return { ok: false, reason: "That address points to a private network." };
  if (NEVER_FETCH.some((pattern) => pattern.test(host))) {
    return { ok: false, reason: "CareerOS doesn't read LinkedIn or Naukri pages. Paste the description instead." };
  }
  return { ok: true, url };
}

export function isIpLiteral(host: string): boolean {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(":");
}

function ipv4Public(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => !Number.isInteger(p) || p < 0 || p > 255)) return false;
  const [a, b] = parts;
  if (a === 0 || a === 10 || a === 127) return false; // "this" network, private, loopback
  if (a === 100 && b >= 64 && b <= 127) return false; // carrier-grade NAT
  if (a === 169 && b === 254) return false; // link-local (cloud metadata lives here)
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 192 && b === 0 && parts[2] === 0) return false;
  if (a === 198 && (b === 18 || b === 19)) return false; // benchmarking
  if (a >= 224) return false; // multicast and reserved
  return true;
}

/** True only for addresses on the public internet. */
export function isPublicIp(ip: string): boolean {
  const address = ip.toLowerCase();
  if (!address.includes(":")) return ipv4Public(address);
  const mapped = address.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (mapped) return ipv4Public(mapped[1]);
  if (address === "::" || address === "::1") return false;
  if (/^f[cd]/.test(address)) return false; // unique local fc00::/7
  if (/^fe[89ab]/.test(address)) return false; // link-local fe80::/10
  if (/^ff/.test(address)) return false; // multicast
  return true;
}
