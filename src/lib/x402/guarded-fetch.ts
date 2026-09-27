import { lookup as dnsLookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";

export const X402_URL_NOT_ALLOWED = "X402_URL_NOT_ALLOWED";
/** Sellers that do not answer in this long are treated as unreachable. */
export const X402_FETCH_TIMEOUT_MS = 20_000;

export type ResolvedAddress = { address: string; family: number };
export type AddressLookup = (hostname: string) => Promise<ResolvedAddress[]>;

// Loopback, private, link-local (cloud metadata lives at 169.254.169.254), CGNAT, multicast,
// "this network", reserved, and their IPv6 counterparts. BlockList checks IPv4-mapped IPv6
// (::ffff:a.b.c.d) against the IPv4 rules itself, so those need no rule of their own.
const blocked = new BlockList();
for (const [address, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4]
] as const) {
  blocked.addSubnet(address, prefix, "ipv4");
}
for (const [address, prefix] of [
  ["::", 128],
  ["::1", 128],
  ["64:ff9b::", 96],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8]
] as const) {
  blocked.addSubnet(address, prefix, "ipv6");
}

function defaultLookup(hostname: string): Promise<ResolvedAddress[]> {
  return dnsLookup(hostname, { all: true, verbatim: true });
}

export function addressIsBlocked(entry: ResolvedAddress): boolean {
  const family = entry.family === 6 ? "ipv6" : "ipv4";
  // Anything BlockList cannot parse is refused rather than trusted.
  try {
    return blocked.check(entry.address, family);
  } catch {
    return true;
  }
}

/**
 * The only addresses the x402 buyer may fetch: https, to a public host. Resolves the host and
 * refuses when any answer is a private, loopback, link-local or otherwise non-public address.
 */
export async function assertX402UrlAllowed(url: string | URL, lookup: AddressLookup = defaultLookup): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(String(url));
  } catch {
    throw new Error(X402_URL_NOT_ALLOWED);
  }
  if (parsed.protocol !== "https:") throw new Error(X402_URL_NOT_ALLOWED);
  if (parsed.username || parsed.password) throw new Error(X402_URL_NOT_ALLOWED);
  const host = parsed.hostname.replace(/^\[|\]$/g, "");
  if (!host) throw new Error(X402_URL_NOT_ALLOWED);

  let addresses: ResolvedAddress[];
  const literal = isIP(host);
  if (literal) {
    addresses = [{ address: host, family: literal }];
  } else {
    try {
      addresses = await lookup(host);
    } catch {
      throw new Error(X402_URL_NOT_ALLOWED);
    }
  }
  if (addresses.length === 0 || addresses.some(addressIsBlocked)) throw new Error(X402_URL_NOT_ALLOWED);
  return parsed;
}

/**
 * fetch for seller addresses the caller names. Redirects are not followed (a public host could
 * otherwise bounce the request to an internal one), and every request has a timeout.
 *
 * ponytail: resolve-then-fetch leaves a DNS-rebinding gap between the check and the connect. Pin
 * the resolved address with an undici Agent connect.lookup if this path ever carries real money.
 */
export function guardedX402Fetch(fetchImpl: typeof fetch = fetch, lookup: AddressLookup = defaultLookup): typeof fetch {
  return (async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const target = input instanceof Request ? input.url : input;
    const url = await assertX402UrlAllowed(target, lookup);
    return fetchImpl(url, {
      ...init,
      redirect: "manual",
      signal: init?.signal ?? AbortSignal.timeout(X402_FETCH_TIMEOUT_MS)
    });
  }) as typeof fetch;
}
