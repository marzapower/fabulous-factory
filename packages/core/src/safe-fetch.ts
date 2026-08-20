import net from "node:net";
import type { Socket } from "node:net";
import type { TLSSocket } from "node:tls";

import {
  Agent,
  buildConnector,
  fetch as undiciFetch,
  Headers as UndiciHeaders,
  Response as UndiciResponse,
  type HeadersInit as UndiciHeadersInit,
  type RequestInit as UndiciRequestInit,
} from "undici";

// `undici` (our explicit ^8 dependency, used for its `Agent`/connector API — plan D.1)
// ships its OWN `Response`/`RequestInit` types, distinct from the ambient
// `Response`/`RequestInit` globals `@types/node` derives from its internally-bundled,
// older `undici-types`. Mixing the two produces spurious structural-incompatibility
// errors under `tsc`, even though both are runtime-compatible with the Fetch API. This
// module deliberately stays on `undici`'s own types end to end (`UndiciResponse` /
// `UndiciRequestInit`) rather than the ambient globals.

export type SafeFetchReason =
  | "invalid_scheme"
  | "blocked_address"
  | "connection_failed"
  | "too_many_redirects"
  | "response_too_large"
  | "timeout"
  | "unsupported_redirect_body";

/** Typed error for every way `safeFetch` refuses or aborts a request (plan D.4). */
export class SafeFetchError extends Error {
  readonly reason: SafeFetchReason;

  constructor(reason: SafeFetchReason, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "SafeFetchError";
    this.reason = reason;
  }
}

const ALLOWED_SCHEMES = new Set(["http:", "https:"]);
const MAX_REDIRECTS = 5;
const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_BYTES = 5 * 1024 * 1024;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

// --- SSRF deny-list (plan D.9.4 — complete enumeration) ---------------------------

function buildDenyList(): net.BlockList {
  const blockList = new net.BlockList();

  // IPv4
  blockList.addSubnet("127.0.0.0", 8, "ipv4"); // loopback
  blockList.addSubnet("10.0.0.0", 8, "ipv4"); // RFC1918
  blockList.addSubnet("172.16.0.0", 12, "ipv4"); // RFC1918
  blockList.addSubnet("192.168.0.0", 16, "ipv4"); // RFC1918
  blockList.addSubnet("169.254.0.0", 16, "ipv4"); // link-local, incl. metadata 169.254.169.254
  blockList.addSubnet("100.64.0.0", 10, "ipv4"); // CGNAT
  blockList.addSubnet("192.0.0.0", 24, "ipv4"); // IETF protocol assignments
  blockList.addSubnet("198.18.0.0", 15, "ipv4"); // benchmarking
  blockList.addSubnet("224.0.0.0", 4, "ipv4"); // multicast
  blockList.addAddress("255.255.255.255", "ipv4"); // broadcast
  blockList.addSubnet("0.0.0.0", 8, "ipv4"); // unspecified / "this network"
  blockList.addSubnet("192.0.2.0", 24, "ipv4"); // documentation (TEST-NET-1)
  blockList.addSubnet("198.51.100.0", 24, "ipv4"); // documentation (TEST-NET-2)
  blockList.addSubnet("203.0.113.0", 24, "ipv4"); // documentation (TEST-NET-3)

  // IPv6
  blockList.addAddress("::1", "ipv6"); // loopback
  blockList.addAddress("::", "ipv6"); // unspecified
  blockList.addSubnet("fe80::", 10, "ipv6"); // link-local
  blockList.addSubnet("ff00::", 8, "ipv6"); // multicast
  blockList.addSubnet("fc00::", 7, "ipv6"); // unique local (ULA)

  return blockList;
}

const DEFAULT_DENY_LIST = buildDenyList();

/**
 * Unmaps IPv4-mapped IPv6 forms (`::ffff:a.b.c.d`) to their plain IPv4 form. Dual-stack
 * sockets can report `socket.remoteAddress` in either form (plan D.9.4) — the deny-list
 * check must catch both, so this runs before every range check.
 */
export function unmapIPv4(address: string): string {
  const match = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address);
  return match ? match[1] : address;
}

/**
 * Pure range check against the complete SSRF deny-list (plan D.9.4): loopback, RFC1918,
 * link-local (incl. cloud metadata 169.254.169.254), CGNAT, IETF special-purpose,
 * benchmarking, multicast, broadcast, unspecified, IPv6 ULA, and documentation ranges.
 * No sockets involved — table-driven-testable directly against every entry, including
 * `::ffff:`-mapped forms.
 *
 * A resolved-but-unparseable address (neither valid IPv4 nor IPv6) is denied by default
 * — fail closed on the one input this function cannot classify.
 */
export function isBlockedAddress(
  address: string,
  denyList: net.BlockList = DEFAULT_DENY_LIST,
): boolean {
  const unmapped = unmapIPv4(address);
  if (net.isIPv4(unmapped)) {
    return denyList.check(unmapped, "ipv4");
  }
  if (net.isIPv6(unmapped)) {
    return denyList.check(unmapped, "ipv6");
  }
  return true;
}

/**
 * Wraps undici's `buildConnector` connector with POST-CONNECT address validation: the
 * ACTUAL socket the connection landed on is checked, not the pre-resolved DNS answer —
 * this is what kills DNS-rebinding TOCTOU by construction (plan D.1). A blocked address
 * gets its socket destroyed and the connect callback errors with `SafeFetchError`.
 */
function createValidatingConnector(
  isBlocked: (address: string) => boolean,
): buildConnector.connector {
  const connect = buildConnector({ timeout: DEFAULT_TIMEOUT_MS });
  return (options, callback) => {
    connect(options, (err, socket) => {
      if (err) {
        callback(err, null);
        return;
      }
      const remoteAddress = (socket as Socket | TLSSocket).remoteAddress;
      if (!remoteAddress || isBlocked(remoteAddress)) {
        socket.destroy();
        callback(
          new SafeFetchError(
            "blocked_address",
            `Blocked outbound connection to ${remoteAddress ?? "an address that reported no remoteAddress"}`,
          ),
          null,
        );
        return;
      }
      callback(null, socket);
    });
  };
}

// Headers that must never survive a cross-origin redirect hop (M1 fix): forwarding
// these to a different origin than the one the caller actually intended leaks
// credentials to whatever host the FIRST server's `Location` header points at — which
// may be attacker-controlled if the fetched URL or its redirect chain is
// user-influenced. Matches standard `fetch`/browser redirect semantics.
const CREDENTIAL_HEADERS_TO_STRIP_CROSS_ORIGIN = ["authorization", "cookie"];

/**
 * True when `body` is a stream that can only be read once — i.e. NOT safely
 * re-sendable to a second hop (M1 fix). Covers the web `ReadableStream` (what `fetch`
 * callers typically pass) and Node.js `Readable`/async-iterable streams (duck-typed via
 * `pipe`/`Symbol.asyncIterator`), without misclassifying already-buffered body types
 * (`string`, `Buffer`/`Uint8Array`, `URLSearchParams`, `FormData`, `Blob`) that ARE safe
 * to resend as-is.
 */
function isNonReplayableStreamBody(body: unknown): boolean {
  if (body instanceof ReadableStream) {
    return true;
  }
  if (typeof body === "object" && body !== null) {
    const candidate = body as { pipe?: unknown; [Symbol.asyncIterator]?: unknown };
    if (typeof candidate.pipe === "function") {
      return true; // Node.js Readable
    }
    if (
      typeof candidate[Symbol.asyncIterator] === "function" &&
      !(body instanceof Blob) &&
      !(body instanceof FormData) &&
      !(body instanceof URLSearchParams)
    ) {
      return true; // generic async-iterable stream
    }
  }
  return false;
}

function findSafeFetchError(err: unknown): SafeFetchError | undefined {
  let current: unknown = err;
  for (let depth = 0; depth < 5 && current; depth += 1) {
    if (current instanceof SafeFetchError) {
      return current;
    }
    current = current instanceof Error ? current.cause : undefined;
  }
  return undefined;
}

export interface SafeFetchOptions extends Omit<UndiciRequestInit, "redirect" | "signal"> {
  /** @default 15_000 */
  timeoutMs?: number;
  /** @default 5_242_880 (5 MB) */
  maxBytes?: number;
}

/**
 * Enforces the response-size cap WHILE STREAMING (plan D.4) — a hostile server sending
 * an unbounded body without an (accurate) `Content-Length` must still be cut off, not
 * just rejected after the fact.
 */
function enforceSizeCap(response: UndiciResponse, maxBytes: number): UndiciResponse {
  if (!response.body) {
    return response;
  }
  const reader = response.body.getReader();
  let total = 0;
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) {
        controller.close();
        return;
      }
      total += value.byteLength;
      if (total > maxBytes) {
        controller.error(
          new SafeFetchError("response_too_large", `Response exceeded ${maxBytes} bytes`),
        );
        await reader.cancel().catch(() => undefined);
        return;
      }
      controller.enqueue(value);
    },
    cancel(reason) {
      return reader.cancel(reason);
    },
  });
  return new UndiciResponse(stream, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

/**
 * Builds a `safeFetch` instance. The `isBlockedAddress` override exists ONLY so tests
 * can exercise the allowed-path against a local server without weakening the exported
 * default: `createSafeFetch` itself is intentionally NOT re-exported from `./index`, so
 * no consumer of `@factory/core` can reach for the override — only test files importing
 * this module directly can.
 */
export function createSafeFetch(
  overrides: { isBlockedAddress?: (address: string) => boolean } = {},
) {
  const isBlocked = overrides.isBlockedAddress ?? isBlockedAddress;
  const agent = new Agent({ connect: createValidatingConnector(isBlocked) });

  return async function safeFetchImpl(
    url: string | URL,
    init: SafeFetchOptions = {},
  ): Promise<UndiciResponse> {
    const {
      timeoutMs = DEFAULT_TIMEOUT_MS,
      maxBytes = DEFAULT_MAX_BYTES,
      method: initMethod,
      body: initBody,
      headers: initHeaders,
      ...requestInit
    } = init;
    const timeoutSignal = AbortSignal.timeout(timeoutMs);

    let currentUrl = new URL(url.toString());
    // Mutable across hops (M1 fix): the method/body/headers actually sent on the NEXT
    // hop can differ from the original request per standard redirect semantics (303 →
    // GET; 301/302 with a non-GET/HEAD method → GET; credential headers dropped on a
    // cross-origin hop) — unlike the original implementation, which re-sent the
    // original method/body/headers unchanged to every hop, including cross-origin ones.
    let method = (initMethod ?? "GET").toUpperCase();
    let body = initBody;
    const headers = new UndiciHeaders(initHeaders as UndiciHeadersInit | undefined);

    for (let redirectCount = 0; ; redirectCount += 1) {
      if (!ALLOWED_SCHEMES.has(currentUrl.protocol)) {
        throw new SafeFetchError("invalid_scheme", `Scheme not allowed: ${currentUrl.protocol}`);
      }

      let response: UndiciResponse;
      try {
        response = await undiciFetch(currentUrl, {
          ...requestInit,
          method,
          body: body as UndiciRequestInit["body"],
          headers,
          redirect: "manual",
          dispatcher: agent,
          signal: timeoutSignal,
        });
      } catch (err) {
        const safeFetchError = findSafeFetchError(err);
        if (safeFetchError) {
          throw safeFetchError;
        }
        if (timeoutSignal.aborted) {
          throw new SafeFetchError("timeout", `Request timed out after ${timeoutMs}ms`, {
            cause: err,
          });
        }
        throw new SafeFetchError("connection_failed", "Failed to connect", { cause: err });
      }

      if (REDIRECT_STATUSES.has(response.status)) {
        // Drain the (typically empty) redirect body so the connection can be reused.
        await response.body?.cancel().catch(() => undefined);

        if (redirectCount >= MAX_REDIRECTS) {
          throw new SafeFetchError("too_many_redirects", `Exceeded ${MAX_REDIRECTS} redirects`);
        }
        const location = response.headers.get("location");
        if (!location) {
          return response;
        }
        const nextUrl = new URL(location, currentUrl);

        // Cross-origin hop: never forward credentials meant for the previous origin —
        // the redirect target may be attacker-controlled (M1 fix).
        if (nextUrl.origin !== currentUrl.origin) {
          for (const headerName of CREDENTIAL_HEADERS_TO_STRIP_CROSS_ORIGIN) {
            headers.delete(headerName);
          }
        }

        if (response.status === 303) {
          // 303: always switch to GET/no-body (except a HEAD stays HEAD), matching
          // standard fetch/browser semantics.
          if (method !== "GET" && method !== "HEAD") {
            method = "GET";
            body = undefined;
          }
        } else if (
          (response.status === 301 || response.status === 302) &&
          method !== "GET" &&
          method !== "HEAD"
        ) {
          // 301/302 with a non-GET/HEAD method: browsers switch to GET and drop the
          // body rather than resending it, so this does too.
          method = "GET";
          body = undefined;
        } else if (body != null && isNonReplayableStreamBody(body)) {
          // 307/308 (or 301/302/303 already GET/HEAD) must resend the SAME body. A
          // stream can only be read once, so it was already consumed by the previous
          // hop — silently sending no body would be wrong; fail loudly instead.
          throw new SafeFetchError(
            "unsupported_redirect_body",
            "Cannot follow redirect: the request body is a non-replayable stream",
          );
        }

        currentUrl = nextUrl;
        continue;
      }

      return enforceSizeCap(response, maxBytes);
    }
  };
}

/**
 * SSRF-safe `fetch` (spec §8.5, plan D.4): scheme allowlist (http/https only),
 * post-connect address validation against the complete deny-list (D.9.4), a manual
 * redirect loop (max 5 hops, every hop re-validated through the same agent), a 5 MB
 * response-size cap enforced while streaming, and a 15s overall timeout. Any feature
 * that fetches a user-supplied URL MUST use this instead of the global `fetch`.
 */
export const safeFetch = createSafeFetch();
