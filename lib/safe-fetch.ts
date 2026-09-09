/**
 * safeFetch — the only sanctioned way to make outbound HTTP requests from OwlDesk.
 *
 * Constraints (enforced for every call):
 *  - only http:/https: schemes
 *  - target host must not be localhost / loopback / link-local / private / reserved
 *  - hard timeout
 *
 * All server-side outbound traffic (LLM provider, bitget-signal MCP) goes through
 * this helper so the rules live in exactly one place.
 */

const BLOCKED_HOSTNAMES = new Set(["localhost", "ip6-localhost", "ip6-loopback"]);

/** Parse a dotted-quad IPv4 into octets, or null if not valid IPv4. */
function parseIpv4(host: string): number[] | null {
  const parts = host.split(".");
  if (parts.length !== 4) return null;
  const octets: number[] = [];
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const value = Number(part);
    if (value > 255) return null;
    octets.push(value);
  }
  return octets;
}

function isPrivateOrReservedV4(host: string): boolean {
  const o = parseIpv4(host);
  if (!o) return false;
  if (o[0] === 0 || o[0] === 10 || o[0] === 127) return true; // 0/8, 10/8, loopback
  if (o[0] === 172 && o[1] >= 16 && o[1] <= 31) return true; // 172.16/12
  if (o[0] === 192 && o[1] === 168) return true; // 192.168/16
  if (o[0] === 169 && o[1] === 254) return true; // link-local incl. cloud metadata
  if (o[0] === 100 && o[1] >= 64 && o[1] <= 127) return true; // CGNAT 100.64/10
  if (o[0] >= 224) return true; // multicast + reserved
  return false;
}

function isPrivateOrReservedV6(host: string): boolean {
  let h = host;
  if (h.startsWith("[")) h = h.slice(1);
  if (h.endsWith("]")) h = h.slice(0, -1);
  h = h.toLowerCase();
  if (h === "::" || h === "::1") return true;
  if (h.startsWith("fe80:")) return true; // link-local
  if (h.startsWith("fc") || h.startsWith("fd")) return true; // unique local
  if (h.startsWith("::ffff:")) {
    const v4 = h.slice(7);
    if (parseIpv4(v4)) return isPrivateOrReservedV4(v4);
  }
  return false;
}

export function assertSafeUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("safeFetch: invalid URL: " + raw);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("safeFetch: scheme not allowed (http/https only): " + url.protocol);
  }
  const host = url.hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.has(host)) {
    throw new Error("safeFetch: host blocked: " + host);
  }
  if (isPrivateOrReservedV4(host) || isPrivateOrReservedV6(host)) {
    throw new Error("safeFetch: host is a private/loopback/reserved address: " + host);
  }
  return url;
}

export async function safeFetch(
  raw: string,
  init: RequestInit = {},
  timeoutMs = 20_000,
): Promise<Response> {
  const url = assertSafeUrl(raw);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}
