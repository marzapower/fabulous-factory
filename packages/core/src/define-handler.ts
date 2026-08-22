import type { NextRequest } from "next/server";
import { z } from "zod";

import { getSession, type Session } from "@factory/auth";
import { getEnv } from "@factory/config";

import { ApiError, shapeError, zodErrorToApiError } from "./errors";
import { getClientIp } from "./get-client-ip";
import { checkRateLimit, type RateLimitPolicy } from "./rate-limit";

type InferInput<S extends z.ZodTypeAny | "none"> = S extends z.ZodTypeAny ? z.infer<S> : undefined;

export interface HandlerCtx<S extends z.ZodTypeAny | "none", Sess> {
  req: NextRequest;
  session: Sess;
  input: InferInput<S>;
  /** Awaited Next 15 route params — optional catch-all segments are `undefined` (plan D.9.9). */
  params: Record<string, string | string[] | undefined>;
}

/**
 * Options is a UNION on auth mode (plan D.4, corrected by D.9.7/D.9.17): public
 * handlers MUST state a rate-limit decision — a policy or the explicit `"none"` opt-out
 * — there is no default, so an agent cannot silently ship an unlimited public endpoint.
 * `auth: "required"` handlers may omit `rateLimit` entirely (limiting an
 * authenticated-only endpoint is the developer's call, not a mandatory decision).
 *
 * `auth: "webhook"` (M7, D.9.17 redeemed, corrected by H.10.1) is its OWN discriminant —
 * NOT a variant of `"public"` — because a `"public"`-discriminant arm would admit
 * `input`/`rateLimit`/`handler` silently under union excess-property semantics. A
 * webhook's auth IS its signature verification (performed inside the adapter the
 * `webhook` fn delegates to): rate-limiting it only causes provider redelivery storms,
 * and origin checks are meaningless for server-to-server delivery. No `input`/
 * `rateLimit`/`handler` keys on this arm.
 */
export type HandlerOptions<S extends z.ZodTypeAny | "none"> =
  | {
      auth: "required";
      input: S;
      rateLimit?: RateLimitPolicy | "none";
      handler: (ctx: HandlerCtx<S, Session>) => Promise<unknown>;
    }
  | {
      auth: "public";
      input: S;
      rateLimit: RateLimitPolicy | "none";
      handler: (ctx: HandlerCtx<S, Session | null>) => Promise<unknown>;
    }
  | {
      auth: "webhook";
      webhook: (req: NextRequest) => Promise<Response>;
    };

/** 1 MiB — content-length guard for the webhook arm (H.10.18(a)). Applied BEFORE the
 * webhook fn ever touches the body: the route is unauthenticated (signature
 * verification happens inside the adapter, after this guard) and deliberately
 * unrate-limited (rate-limiting a webhook only causes provider redelivery storms), so
 * this is the one cheap defense available pre-verification against an oversized
 * payload tying up the request. */
const WEBHOOK_MAX_CONTENT_LENGTH = 1_048_576;

/** Body-size envelope for the webhook arm (H.10 review fix over H.10.18(a)): a bare
 * content-length check trusted the header's PRESENCE, which a chunked-transfer request
 * (no content-length at all) or a malformed value would simply skip — the adapter would
 * then buffer an unbounded body via its own `req.text()`. Server-to-server webhook
 * senders (Stripe, Inngest) always send a valid content-length; there is no legitimate
 * reason for this unauthenticated arm to accept a request that omits or garbles it, so
 * that case is refused by design rather than let through.
 *   - missing/non-finite header → 411 length_required
 *   - finite header over the cap → 413 payload_too_large (unchanged)
 *   - finite header within the cap → pass */
function checkWebhookContentLength(req: NextRequest): Response | undefined {
  const raw = req.headers.get("content-length");
  const contentLength = Number(raw);
  if (raw === null || !Number.isFinite(contentLength)) {
    return Response.json(
      { error: { code: "length_required", message: "Content-Length header is required" } },
      { status: 411 },
    );
  }
  if (contentLength > WEBHOOK_MAX_CONTENT_LENGTH) {
    return Response.json(
      { error: { code: "payload_too_large", message: "Payload too large" } },
      { status: 413 },
    );
  }
  return undefined;
}

/**
 * The second argument Next hands a route handler.
 *
 * A route with dynamic segments (`app/api/auth/[...all]/route.ts`) gets a real promise
 * of its params. A route WITHOUT them (`app/api/runs/route.ts`) gets the `params` key
 * with `undefined` as its value — verified against Next 15.5 by probing a live request,
 * and `await undefined` is `undefined`, so the awaited result is what actually differs.
 *
 * Next's own generated route types (`.next/types/**`) declare `params` as a
 * non-optional `Promise<any>` regardless, so this interface cannot be widened to
 * `params?:` without failing typecheck against the framework's declaration. Modelling
 * the nullability on the RESOLVED value is both accurate about what `await` yields and
 * assignable to `Promise<any>`.
 *
 * Getting this wrong is what shipped the defect: the old type promised a total
 * `Record`, so `Object.entries(params)` inside `deriveRouteName` looked safe, and every
 * rate-limited route with no dynamic segments — `/api/runs` and both `/api/demo/*`
 * examples, i.e. the whole interactive surface — answered 500. `HandlerCtx.params`
 * stays non-optional: the wrapper substitutes `{}`, so handlers never see the seam.
 */
export interface NextRouteContext {
  params: Promise<Record<string, string | string[] | undefined> | undefined>;
}

const STATE_CHANGING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

// Once-per-process emission (I.3.b/opt-6): `/api/health` is `rateLimit: "none"` and the
// Docker HEALTHCHECK polls it every 30s — an unthrottled `console.error` on every request
// would stream a stack trace on exactly the failure mode this tolerance exists to survive
// (a broken auth stack under a live healthcheck). One line per process is enough to alert
// an operator without flooding the logs.
let sessionFailureWarned = false;

function warnSessionFailureOnce(err: unknown): void {
  if (sessionFailureWarned) return;
  sessionFailureWarned = true;
  console.error(
    "[@factory/core] getSession() failed on a public route — degrading to session: null (this warning is emitted once per process)",
    err,
  );
}

/**
 * The only legal way to declare a route handler (spec §8.4 — enforced structurally, and
 * backstopped by the raw-handler lint ban, plan D.5). Auth, rate limiting, origin
 * checking, input validation, and error shaping all run inside this wrapper so an agent
 * cannot forget them: there is nowhere left to write a raw handler.
 *
 * Runtime order (plan D.4, rewritten by D.9.2/D.9.11/D.9.12, webhook arm by H.10.1):
 *   0. webhook   — `auth: "webhook"` short-circuits here, before ANY of steps 1-6: a
 *                  content-length guard (411 when missing/non-finite — refuses chunked
 *                  transfer on this unauthenticated arm by design; 413 over 1 MiB), then
 *                  straight to `opts.webhook`.
 *   1. session   — resolved once via `getSession()`, tolerant of a failing auth stack
 *                  (I.3.b): `auth: "required"` rethrows (shaped 500 below); `public`
 *                  degrades to `session: null` instead of 500ing (see the CONTRACT note
 *                  on the try/catch itself).
 *   2. rate limit — subject `user:{id}` when a session exists, else `ip:{clientIp}`.
 *   3. auth      — `'required'` + no session → 401.
 *   4. origin    — state-changing methods only; reject a mismatched/cross-site Origin.
 *   5. input     — the wrapper's OWN zod parse failure → 400 (the only such site).
 *   6. handler   — `instanceof Response` passes through; anything else is `Response.json`-wrapped.
 */
export function defineHandler<S extends z.ZodTypeAny | "none">(
  opts: HandlerOptions<S>,
): (req: NextRequest, ctx: NextRouteContext) => Promise<Response> {
  return async function handleRequest(req, routeCtx) {
    try {
      // (0) Webhook arm — checked FIRST, before getSession()/rate-limit/origin/input
      // (H.10.1): a webhook's auth is its own signature verification, performed inside
      // `opts.webhook` itself, so none of the session/DB/rate-limit machinery below
      // should run. Still inside this try/catch, so a thrown error is shaped into a 500
      // by the same `shapeError` call every other arm uses (providers retry on 5xx).
      if (opts.auth === "webhook") {
        const lengthError = checkWebhookContentLength(req);
        if (lengthError) {
          return lengthError;
        }
        // The wrapper never touches the body — reading it (json()/text()) is a
        // single-consumption operation that belongs entirely to the adapter behind
        // `opts.webhook` (e.g. Stripe's raw-body signature check).
        return await opts.webhook(req);
      }

      // (1) Session, resolved once. Better Auth's own `getSession` implementation reads
      // the session cookie from headers before touching the database, so cookie-less
      // requests — the common case for public traffic — never reach Postgres; no extra
      // fast-path logic is needed on top of the single `getSession()` call.
      let session: Awaited<ReturnType<typeof getSession>> = null;
      try {
        session = await getSession();
      } catch (err) {
        // auth: "required" routes fail loudly (500 via shapeError below) — a broken auth
        // stack must not silently 401 users who hold valid cookies. Public routes degrade
        // to anonymous. CONTRACT (I.10.10): a public handler may observe `session: null`
        // for a request that carries a VALID cookie whenever the auth stack is failing —
        // `null` is never an authorization decision, only "no usable session here".
        if (opts.auth === "required") throw err;
        warnSessionFailureOnce(err);
      }

      // Params are awaited here (moved up from step (6), B2 fix) so the rate-limit
      // bucket name can be derived from the route PATTERN rather than the concrete
      // pathname. This is not a security-ordering step — awaiting params has no auth/
      // rate-limit/origin/input semantics of its own — so pulling it earlier does not
      // change the session→ratelimit→auth→origin→input order plan D.4/D.9.2 mandates.
      // `?? {}` is load-bearing, not defensive padding: see `NextRouteContext`. A route
      // with no dynamic segments gets `params: undefined` from Next, and every consumer
      // below (`deriveRouteName`, `HandlerCtx.params`) is typed as receiving an object.
      //
      // Substituting `{}` cannot reintroduce B2's unbounded-bucket bug: `deriveRouteName`
      // only rewrites segments that MATCH a param value, so with no params it returns the
      // pathname unchanged — and the only routes that reach here with no params are the
      // ones that have no dynamic segments. Verified against Next 15.5's own matcher: a
      // dynamic matcher always produces a params object (an optional catch-all at its
      // base yields a truthy `{}`), so `undefined` is reachable only on the static branch.
      //
      // The remaining assumption is that a static route's pathname IS its bucket, and
      // that one is NOT framework-guaranteed: `req.nextUrl.pathname` is the PRE-rewrite
      // URL. Nothing in this repo rewrites (`apps/web/middleware.ts` only calls
      // `next()`/`redirect()`, and `next.config.ts` declares no `rewrites()`), but an
      // adopter who adds a rewrite from a VARIABLE source path onto a rate-limited static
      // route would mint one bucket per source path. If you add rewrites, derive the
      // bucket from the destination, not from `nextUrl.pathname`.
      const params = (await routeCtx.params) ?? {};

      // (2) Rate limit.
      if (opts.rateLimit && opts.rateLimit !== "none") {
        const subject = session ? `user:${session.user.id}` : `ip:${getClientIp(req.headers)}`;
        const result = await checkRateLimit({
          name: deriveRouteName(req.method, req.nextUrl.pathname, params),
          subject,
          windowSeconds: opts.rateLimit.windowSeconds,
          max: opts.rateLimit.max,
        });
        if (!result.allowed) {
          throw new ApiError(429, "rate_limited", "Too many requests", undefined, {
            "Retry-After": String(result.retryAfterSeconds),
          });
        }
      }

      // (3) Auth decision.
      if (opts.auth === "required" && !session) {
        throw new ApiError(401, "unauthorized", "Authentication required");
      }

      // (4) Origin check — state-changing methods only. Route handlers get no framework
      // CSRF protection (unlike Server Actions, which Next 15.5 already verifies —
      // `defineAction` therefore skips this, plan D.1/D.9.11).
      if (STATE_CHANGING_METHODS.has(req.method.toUpperCase()) && !isOriginAllowed(req)) {
        throw new ApiError(403, "invalid_origin", "Origin check failed");
      }

      // (5) Input parse.
      const input = await parseInput(req, opts.input);

      // (6) Handler. `params` was already awaited above (moved up for the rate-limit
      // bucket-name derivation).
      const ctx = { req, session, input, params } as HandlerCtx<S, Session | null>;
      const handler = opts.handler as (ctx: HandlerCtx<S, Session | null>) => Promise<unknown>;
      const result = await handler(ctx);
      return result instanceof Response ? result : Response.json(result);
    } catch (err) {
      return shapeError(err);
    }
  };
}

/**
 * Derives a rate-limit bucket name from the route PATTERN, not the concrete request
 * (B2 fix). Using the raw pathname (`${method} ${pathname}`) on a dynamic route like
 * `/api/items/[id]` gives every `id` its own bucket: an attacker gets an
 * unlimited-multiplier bypass (a fresh limit per id) and the `rate_limits` table grows
 * one row per distinct id ever requested, forever. Replacing each segment that matches
 * an awaited route param's VALUE with a `:key` placeholder collapses all ids of one
 * route back onto a single shared bucket, e.g. `GET /api/items/:id`.
 *
 * KNOWN LIMITATION (accepted, plan D.9 review): a param value replaces EVERY segment
 * that equals it, not just the segment at the param's own position — so a pathological
 * literal segment that happens to equal a param's value (e.g. `/api/items/123/123`
 * where `123` is both the `:id` and a coincidentally-identical literal segment) also
 * gets replaced. This only ever makes bucket names coarser (more requests sharing one
 * bucket), never finer — it cannot reintroduce the unbounded-cardinality bug this fix
 * exists to close, so it's accepted rather than solved with full route-pattern
 * metadata Next.js doesn't expose to a request handler.
 *
 * SECOND KNOWN LIMITATION (same accepted trade-off): `params` values arrive DECODED,
 * while `pathname` segments do not — so `/api/items/a%62c` yields `id: "abc"`, matches
 * no raw segment, and gets a bucket of its own. Same shape as the bug above but in the
 * other direction: it makes buckets finer, so it is a real (if awkward to reach) way to
 * multiply buckets on a dynamic route. Not reachable in this repo — the only dynamic
 * route, `apps/web/app/api/auth/[...all]/route.ts`, is a webhook-style passthrough that
 * never goes through the rate-limit arm. Decode each segment before comparing if you add
 * a rate-limited dynamic route.
 */
export function deriveRouteName(
  method: string,
  pathname: string,
  params: Record<string, string | string[] | undefined>,
): string {
  const segments = pathname.split("/");

  // Catch-all/array params first: they span multiple contiguous segments, so they must
  // be collapsed into a single placeholder before single-value params are matched —
  // otherwise a catch-all's individual segments could get matched independently by an
  // unrelated string param that happens to share one of those segment values.
  for (const [key, value] of Object.entries(params)) {
    if (!Array.isArray(value) || value.length === 0) {
      continue;
    }
    const start = findConsecutiveSubsequence(segments, value);
    if (start !== -1) {
      segments.splice(start, value.length, `:${key}`);
    }
  }

  for (const [key, value] of Object.entries(params)) {
    if (typeof value !== "string") {
      continue;
    }
    for (let i = 0; i < segments.length; i += 1) {
      if (segments[i] === value) {
        segments[i] = `:${key}`;
      }
    }
  }

  return `${method.toUpperCase()} ${segments.join("/")}`;
}

/** Finds the start index of `needle` as a contiguous run within `haystack`, or -1. */
function findConsecutiveSubsequence(haystack: string[], needle: string[]): number {
  for (let i = 0; i <= haystack.length - needle.length; i += 1) {
    let matched = true;
    for (let j = 0; j < needle.length; j += 1) {
      if (haystack[i + j] !== needle[j]) {
        matched = false;
        break;
      }
    }
    if (matched) {
      return i;
    }
  }
  return -1;
}

/**
 * Origin check (plan D.9.11): compare the `Origin` header's host against `APP_URL` when
 * set, else the `Host` header. Absent `Origin` (curl, webhooks, same-origin browser
 * navigations that omit it) passes. `Sec-Fetch-Site: cross-site` is rejected whenever
 * present, independent of whether `Origin` is present.
 */
function isOriginAllowed(req: NextRequest): boolean {
  if (req.headers.get("sec-fetch-site") === "cross-site") {
    return false;
  }

  const origin = req.headers.get("origin");
  if (!origin) {
    return true;
  }

  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    return false; // malformed Origin header — reject rather than guess
  }

  const appUrl = getEnv().APP_URL;
  if (appUrl) {
    try {
      return originHost === new URL(appUrl).host;
    } catch {
      return originHost === appUrl;
    }
  }

  const host = req.headers.get("host");
  if (!host) {
    return true; // nothing to compare against
  }
  return originHost === host;
}

/**
 * GET/HEAD read input from the URL's query string; every other method reads a JSON
 * body. The wrapper's own zod failure here is the only 400 site (plan D.9.12) — a
 * `ZodError` escaping the user's handler body is caught by the outer try/catch and
 * shaped into an opaque 500 instead.
 */
async function parseInput<S extends z.ZodTypeAny | "none">(
  req: NextRequest,
  schema: S,
): Promise<InferInput<S>> {
  if (schema === "none") {
    return undefined as InferInput<S>;
  }

  const method = req.method.toUpperCase();
  let raw: unknown;
  if (method === "GET" || method === "HEAD") {
    raw = Object.fromEntries(req.nextUrl.searchParams.entries());
  } else {
    try {
      raw = await req.json();
    } catch {
      throw new ApiError(400, "invalid_input", "Invalid JSON body");
    }
  }

  const result = (schema as z.ZodTypeAny).safeParse(raw);
  if (!result.success) {
    throw zodErrorToApiError(result.error);
  }
  return result.data as InferInput<S>;
}
