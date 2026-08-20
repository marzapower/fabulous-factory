/**
 * Best-effort caller IP for rate-limit bucketing ONLY — never a security/access
 * decision (plan D.9.10, spec §8.5). Takes the first entry of `x-forwarded-for` (the
 * convention followed by Vercel and every standard reverse proxy: the proxy prepends the
 * real client address as the first, left-most entry) or `"unknown"` when the header is
 * absent.
 *
 * CAVEAT: `x-forwarded-for` is a plain client-settable header. It is only trustworthy
 * when the app sits behind a proxy that overwrites (rather than blindly forwards) it —
 * true on Vercel, not guaranteed on a bare/self-hosted deployment. Header-less or
 * spoofed-empty traffic collapses into one shared `ip:unknown` bucket, consciously: this
 * is abuse mitigation for expensive endpoints, not L7 DDoS defense (that's the
 * CDN/proxy's job).
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
  return trimmed && trimmed.length > 0 ? trimmed : "unknown";
}
