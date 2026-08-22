import net from "node:net";

// Longest textual IPv4-mapped IPv6 literal (e.g. "0000:0000:0000:0000:0000:ffff:255.255.255.255"
// is 45 characters) — the ceiling for ANY value `net.isIP()` would ever accept.
const MAX_IP_LENGTH = 45;

/**
 * Best-effort caller IP for rate-limit bucketing ONLY — never a security/access
 * decision (plan D.9.10, spec §8.5). Takes the first entry of `x-forwarded-for` (the
 * convention followed by Vercel and every standard reverse proxy: the proxy prepends the
 * real client address as the first, left-most entry) or `"unknown"` when the header is
 * absent.
 *
 * CAVEAT: `x-forwarded-for` is a plain client-settable header. It is only trustworthy
 * when the app sits behind a proxy that overwrites (rather than blindly forwards) it —
 * true on Vercel, not guaranteed on a bare/self-hosted deployment. Header-less, spoofed-
 * empty, or spoofed-non-IP traffic collapses into one shared `ip:unknown` bucket,
 * consciously: this is abuse mitigation for expensive endpoints, not L7 DDoS defense
 * (that's the CDN/proxy's job).
 *
 * HARDENING (K.16 N3): the extracted value is capped in length and then validated with
 * `net.isIP()` before it is trusted. Without this, an unvalidated, uncapped entry becomes
 * part of the `rate_limits` primary key (`packages/db/src/schema/rate-limit.ts`) — behind
 * a non-normalizing proxy an anonymous visitor could mint a fresh bucket per request
 * (a new garbage "address" each time), bypassing the limit entirely and accumulating rows
 * instead of collapsing into the one shared bucket this function's contract promises.
 *
 * Accepts a plain `Headers` object (not a full `Request`) so both `defineHandler`
 * (`req.headers`) and `defineAction` (`await headers()` from `next/headers`, which has no
 * backing `Request`) can share the one implementation.
 */
export function getClientIp(headers: Headers): string {
  const forwardedFor = headers.get("x-forwarded-for");
  if (!forwardedFor) {
    return "unknown";
  }
  const [first] = forwardedFor.split(",");
  const trimmed = first?.trim();
  if (!trimmed || trimmed.length > MAX_IP_LENGTH || net.isIP(trimmed) === 0) {
    return "unknown";
  }
  return trimmed;
}
