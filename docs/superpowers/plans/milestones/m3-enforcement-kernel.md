# Part D — Milestone 3 contracts (enforcement kernel)

> Extracted 2026-08-20 from `2026-08-20-master-plan.md` (single-file plan split per-milestone).
> Part A (milestone map + cross-milestone invariants) stays in the master plan.
> "Critique corrections" subsections are BINDING and supersede earlier text in this file.

### D.0 Scope statement

**In:** `packages/core` (`defineHandler`/`defineAction`, `ApiError` + error shaping,
Postgres fixed-window rate limiter, `safeFetch`, `untrusted()`); raw-handler lint ban +
architecture boundary rules wired into `pnpm check`; security headers; `middleware.ts`
(optimistic allowlist — explicitly NOT the security boundary, spec §8.5); migration of the
existing raw routes to the wrappers; guarded-zones CI job + PR security checklist
template; gitleaks/dependency-audit/semgrep CI gates; `rate_limits` table in
`packages/db` (+ migration 0001).

**Explicitly out:** the `webhook` option of `defineHandler` (M7 — the option name is
reserved in the type as an optional never-used field or omitted entirely until M7; decide
at implementation with a TODO(M7)); CSRF beyond what Next + Better Auth already enforce
plus Origin checks in the wrapper (documented); full CSP (headers ship without CSP in M3,
follow-up recorded — see D.1 once research lands); no new product surface; no email/llm/
billing packages.

### D.1 Verified tooling facts (orchestrator verification, 2026-08-20)

- **Better Auth session cookie helper** (verified in the installed 1.7.1 dist):
  `import { getSessionCookie } from "better-auth/cookies"` —
  `getSessionCookie(request: Request | Headers, config?)`. Cookie-presence only, no DB —
  exactly what the optimistic middleware needs.
- **Drizzle atomic upsert** (verified in installed 0.45.2 types):
  `db.insert(rateLimits).values(...).onConflictDoUpdate({ target: [...], set: { count: sql`${rateLimits.count} + 1` } }).returning()`.
  Window start computed app-side from epoch math (`floor(now/windowMs)*windowMs`) — no DB
  clock round-trip needed; document the single-clock assumption.
- **safeFetch mechanism** (undici Connector docs, nodejs/undici main): `packages/core`
  depends on `undici` (^8, currently 8.10.0; Node 22 bundles 6.x internally but does not
  expose Agent/fetch dispatcher types — the explicit dep pins behavior) and uses its
  `fetch` with an `Agent` whose custom `connect` wraps `buildConnector(...)`: after the
  socket connects, validate `socket.remoteAddress` against the deny-list
  (loopback, RFC1918, link-local 169.254/16 incl. metadata 169.254.169.254, IPv6
  loopback/link-local/ULA, 0.0.0.0/8) via `net.BlockList`; destroy + error when denied.
  Post-connect validation kills the DNS-rebinding TOCTOU by construction (the ACTUAL
  address is checked, not the pre-resolved one). Manual redirect loop (max 5) re-enters
  the same agent so every hop is re-validated. `request-filtering-agent` (3.2.1) targets
  node http agents, not fetch — not used.
- **gitleaks**: do NOT use `gitleaks/gitleaks-action@v2` — org use requires a license key
  AND the action runs on Node 20, which GitHub removes from runners in Sept 2026. Run the
  MIT-licensed CLI directly instead: official container
  (`docker run --rm -v $PWD:/repo ghcr.io/gitleaks/gitleaks:latest git /repo --redact
--no-banner` or the equivalent binary download) in a plain step. Implementer verifies
  the current image tag/invocation.
- **semgrep**: OSS invocation without tokens: `semgrep scan --config p/owasp-top-ten
--error` (registry `p/` configs are anonymously fetchable) via the official
  `semgrep/semgrep` container or pipx install. `semgrep ci` requires an account — not
  used. Implementer verifies current image/flags.
- **pnpm audit**: `pnpm audit --prod --audit-level high` as the CI gate (dev-only
  advisories don't block); implementer verifies flag behavior under pnpm 11.
- **Next 15.5 Server Actions** ship built-in Origin↔Host verification for POSTs
  (`serverActions.allowedOrigins` to extend) — `defineAction` therefore does NOT
  duplicate origin checks; `defineHandler` DOES check Origin (when present) against
  Host/APP_URL for state-changing methods, since route handlers get no framework CSRF
  protection. Implementer verifies against the shipped Next docs in node_modules.
- **ESLint 10 flat config** supports inline plugin objects (`plugins: { factory: { rules:
{...} } }`) — write the two enforcement rules as a small inline plugin in
  `eslint.config.mjs` (more precise than `no-restricted-syntax` selectors for the
  "CallExpression-initializer-only" allowance); scope via flat-config `files` globs.
  Fixture-style rule tests (D.8) prove both directions.
- **dependency-cruiser 18.2.0** for boundary rules (`.dependency-cruiser.cjs`,
  `depcruise --config` in CI/`pnpm boundaries`); it resolves TS sources + workspace
  `exports` (implementer verifies the two nontrivial resolutions — `@factory/config/node`
  subpath and TS-source workspace links — with a deliberate violation fixture before
  trusting green).

### D.2 Layering decision (declared)

`packages/core` imports `@factory/auth` (session resolution), `@factory/db` (rate-limit
table), `@factory/config` (env/capabilities). Nothing imports core yet except `apps/web`.
Rationale: the kernel glues auth + validation + limiting; dependency injection here would
be ceremony against KISS. `@factory/auth` must NOT import core (no cycle). Boundary rules
encode this DAG: config ← db ← auth ← core ← web.

### D.3 `packages/db` additions (orchestrator pre-work, like C.2)

- `src/schema/rate-limit.ts`: table `rate_limits` — `key` text (caller-composed:
  `${name}:${subject}`), `window_start` timestamptz, `count` integer not null default 1,
  PRIMARY KEY (`key`, `window_start`). Exported from `schema/index.ts`.
- Migration `0001_*` generated via drizzle-kit, checked in.
- No API changes to `getDb()`.

### D.4 `packages/core` — file manifest and contracts (owner: core agent)

```
packages/core/
├── package.json          # "@factory/core"; exports ".": src/index.ts; deps: @factory/{auth,db,config}, zod, server-only
├── tsconfig.json / vitest.config.ts
├── src/
│   ├── errors.ts         # ApiError(status, code, message?, details?) extends Error; toResponse() shaping;
│   │                     #   shapeError(err): Response — zod → 400 invalid_input (issue list, no stack);
│   │                     #   ApiError → its status/code; unknown → 500 internal_error, logged server-side,
│   │                     #   generic body (never leaks message/stack)
│   ├── rate-limit.ts     # checkRateLimit(opts: { name: string; subject: string; windowSeconds: number;
│   │                     #   max: number }): Promise<{ allowed: boolean; remaining: number;
│   │                     #   retryAfterSeconds: number }> — Postgres fixed-window via atomic upsert
│   │                     #   (insert … onConflictDoUpdate count = count + 1 RETURNING); window start
│   │                     #   computed APP-SIDE from epoch math (floor(Date.now()/windowMs)*windowMs —
│   │                     #   multi-replica skew only blurs window edges, acceptable per §8.5); pruning
│   │                     #   (delete expired windows, probabilistic ~1% of calls + always on window roll);
│   │                     #   FAIL-CLOSED for 'public' handlers / FAIL-OPEN? → decision: fail-open with a
│   │                     #   server-side error log (a broken DB already breaks the handler body anyway;
│   │                     #   documented in the module comment)
│   ├── define-handler.ts # THE wrapper (contract below)
│   ├── define-action.ts  # server-action wrapper (contract below)
│   ├── safe-fetch.ts     # safeFetch(url, init?) — scheme allowlist http/https; resolves ALL A/AAAA
│   │                     #   records and rejects private/loopback/link-local/metadata/ULA ranges;
│   │                     #   connects only to validated IPs (mechanism per D.1 research);
│   │                     #   redirect: manual loop (max 5) re-validating every hop; response size cap
│   │                     #   (default 5 MB) enforced while streaming; overall timeout (default 15s)
│   │                     #   via AbortSignal; typed SafeFetchError with reason codes
│   ├── untrusted.ts      # Untrusted<T> branded type + untrusted(value) + isUntrusted();
│   │                     #   minimal in M3 — the LLM gateway (M5) consumes the brand
│   └── index.ts          # import "server-only"; re-exports everything
└── test/
    ├── define-handler.test.ts   # auth modes (mock @factory/auth via vi.mock), input validation paths,
    │                            #   rate-limit wiring (mock), error shaping incl. unknown-error opacity
    ├── define-action.test.ts    # same matrix for actions; result envelope; never-throws contract
    ├── errors.test.ts
    ├── untrusted.test.ts
    ├── safe-fetch.test.ts       # against a local http server: allowed fetch, size cap, timeout,
    │                            #   redirect-to-private blocked, literal-IP private blocked, scheme denied
    └── integration/rate-limit.test.ts  # TEST_DATABASE_URL skip-clean; window rolls, max enforced,
                                        #   concurrent increments atomic (Promise.all)
```

**`defineHandler` contract (the headline API):**

```ts
type RateLimitPolicy = { windowSeconds: number; max: number };

// Options is a UNION on auth mode: public handlers MUST state a rate-limit decision.
type HandlerOptions<S extends z.ZodTypeAny | "none"> =
  | {
      auth: "required";
      input: S;
      rateLimit?: RateLimitPolicy | "none";
      handler: (ctx: HandlerCtx<S, Session>) => Promise<Response | unknown>;
    }
  | {
      auth: "public";
      input: S;
      rateLimit: RateLimitPolicy | "none"; // ← required key
      handler: (ctx: HandlerCtx<S, null>) => Promise<Response | unknown>;
    };

interface HandlerCtx<S, Sess> {
  req: NextRequest;
  session: Sess extends null ? Session | null : Session; // 'required' → non-null Session
  input: S extends z.ZodTypeAny ? z.infer<S> : undefined;
  params: Record<string, string | string[]>; // awaited Next 15 params
}

export function defineHandler<S extends z.ZodTypeAny | "none">(
  opts: HandlerOptions<S>,
): (
  req: NextRequest,
  ctx: { params: Promise<Record<string, string | string[]>> },
) => Promise<Response>;
```

Runtime order inside the wrapper: (1) resolve the session ONCE via `getSession()` —
fast path: no session cookie present → skip the DB entirely, session = null; (2) rate
limit — subject `user:{id}` when a session exists, else `ip:{clientIp}` via the pinned
`getClientIp(req)` helper (first `x-forwarded-for` entry; trustworthy on Vercel/behind a
proxy, spoofable bare — spec §8.5 caveat applies: this is abuse mitigation, not DDoS
defense; header-less traffic shares one `ip:unknown` bucket, consciously); honest caveat:
cookie-bearing floods still cost one session lookup per request; (3) auth decision
(`'required'` + null session → 401 JSON); (4) origin check for POST/PUT/PATCH/DELETE:
when an `Origin` header is present it must match `APP_URL` when set, else the `Host`
header (absent Origin — curl, webhooks — passes; `Sec-Fetch-Site: cross-site` is
additionally rejected when present); (5) input parse — GET/HEAD from `URL.searchParams`
entries, other methods from JSON body; the WRAPPER'S OWN zod parse failure → 400 (parsed
at the call site — a ZodError escaping the user's handler body is a bug and stays a 500);
(6) handler; `instanceof Response` returns pass through, anything else is
`Response.json`-wrapped. 429 responses carry `Retry-After`.

**`defineAction` contract:**

```ts
type ActionResult<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string; issues?: EnvIssueLike[] } };

defineAction<S extends z.ZodTypeAny | "none", T>(opts:
  | { auth: "required"; input: S; rateLimit?: RateLimitPolicy | "none";
      action: (ctx: { session: Session; input: ... }) => Promise<T> }
  | { auth: "public";  input: S; rateLimit: RateLimitPolicy | "none";
      action: (ctx: { session: Session | null; input: ... }) => Promise<T> }
): (rawInput: unknown) => Promise<ActionResult<T>>;
```

Actions NEVER throw to the caller — every failure is a typed `{ ok: false }` envelope
(Next masks server errors in prod; a typed envelope is the only honest client contract).
No server actions exist yet; the demo (M6) is the first consumer.

### D.5 Lint ban + boundary rules (owner: guard agent)

- **Raw-handler ban** in root `eslint.config.mjs` (inline plugin or no-restricted-syntax
  per D.1): in `apps/*/app/**/route.ts`, exported HTTP-method bindings are legal ONLY as
  `export const GET = defineHandler(...)` (CallExpression initializer) or the documented
  framework-mount destructuring `export const { GET, POST } = toNextJsHandler(auth)`
  (allowlisted file: `app/api/auth/[...all]/route.ts` with an explanatory comment).
  `export async function GET/...` and arrow/function-expression initializers are errors.
  In `"use server"` files: every export must be a `defineAction(...)` call result.
- **Boundary rules** (tool per D.1 research): encode the D.2 DAG plus — `better-auth`
  imports only in `packages/auth`; `pg`/`drizzle-orm` only in `packages/db`;
  `@factory/config/node` importable only by package scripts + `packages/db`; no package
  imports from `apps/*`. Wired as `pnpm boundaries`, added to `pnpm check` between lint
  and typecheck.
- **process.env ban**: ESLint `no-restricted-properties`/`no-process-env`-style rule
  everywhere EXCEPT `packages/config/src`, `packages/config/scripts`, `**/test/**`,
  `*.config.*` — the M2 documented exceptions become machine-enforced.

### D.6 App integration (owner: guard agent)

- `apps/web/app/api/health/route.ts` → `defineHandler({ auth: "public", input: "none",
rateLimit: "none" })` (liveness must never be limited), body unchanged.
- `apps/web/middleware.ts`: optimistic layer ONLY (spec §8.5 — cf. CVE-2025-29927):
  public allowlist (`/`, `/login`, `/signup`, `/api/auth/*`, `/api/health`, static
  assets); everything else redirects to `/login` when the Better Auth session cookie is
  absent (cookie-presence check per D.1 — no DB call in middleware). A comment states the
  real boundary is the wrapper.
- Security headers (location per D.1 research): X-Content-Type-Options nosniff,
  X-Frame-Options DENY, Referrer-Policy strict-origin-when-cross-origin,
  Permissions-Policy minimal, HSTS (prod only). CSP deliberately deferred with a
  documented follow-up.
- Dashboard/login/signup pages keep working — middleware must not break the verified M2
  flows (the C.9 curl matrix is re-run as the M3 regression check).

### D.7 CI security gates (owner: guard agent)

- New `security` job: gitleaks (full-history scan), `pnpm audit` (fail on high+),
  semgrep OWASP ruleset (versions/actions per D.1). Keep runtimes reasonable (semgrep on
  changed files for PRs is acceptable if the action supports it; full scan on main).
- New `guarded-zones` job (PR only): detect changes vs base touching
  `packages/auth|billing|core`, `apps/web/middleware.ts`, `packages/db/migrations`;
  if touched, require the PR body to contain the completed security-checklist marker
  (`- [x] security-checklist`) — fail with a helpful message otherwise.
- `.github/PULL_REQUEST_TEMPLATE.md` with the checklist (auth decision reviewed, input
  validated, no secrets logged, migrations reversible-or-safe, rate limits considered).
- `pnpm check` gains the boundaries step; CI `quality` job inherits it via `pnpm check`?
  — NO: CI runs discrete steps; add `pnpm boundaries` as its own step after lint.

### D.8 Definition of done (M3)

A raw `export async function GET` in a route file fails `pnpm lint` (proven by a fixture
test or a temporary file during verification, not committed); boundary violations fail
`pnpm boundaries` (same proof); `pnpm check` green; rate-limit integration test green
against live Postgres; safeFetch test suite green incl. private-IP and redirect cases;
the M2 curl matrix (signup/session/dashboard/health) re-verified with middleware + new
headers active; 429 path manually exercised on a rate-limited test route (temporary,
not committed) or via the integration suite; CI file review; one Conventional Commit,
approval-gated.

### D.9 Critique corrections (BINDING — supersede any conflicting text in D.0–D.8)

Implementers MUST read this section; where it conflicts with earlier Part D text, D.9 wins.

1. **Rate-limit clock**: app-side epoch math everywhere
   (`new Date(Math.floor(Date.now() / windowMs) * windowMs)`); never DB `now()`.
2. **Wrapper order**: session-first (already rewritten in D.4). Cookie-less requests skip
   the session DB lookup.
3. **Raw-handler lint rule — exact semantics** (kills the `export { h as GET }` bypass):
   in `apps/*/app/**/route.ts`: (a) `export * from` is FORBIDDEN entirely; (b) any export
   specifier (`export { x as GET }`, re-exports included) whose exported name is an HTTP
   method (GET/POST/PUT/PATCH/DELETE/HEAD/OPTIONS) is FORBIDDEN; (c) `export
async function GET…` and `export const GET = <non-CallExpression>` are FORBIDDEN;
   (d) `export const GET = defineHandler({...})` is legal ONLY when the callee is exactly
   the identifier `defineHandler` (aliasing `const dh = defineHandler` errors — acceptable
   false positive, canonical form is the point); (e) the single allowlisted file
   `app/api/auth/[...all]/route.ts` may use exactly
   `export const { GET, POST } = toNextJsHandler(auth)` (callee identifier
   `toNextJsHandler`). In `"use server"` files: every exported value must be a
   `defineAction(...)` call by the same callee-identifier rule.
4. **safeFetch deny-list — complete enumeration** (table-driven test over EVERY entry,
   including `::ffff:` IPv4-mapped forms, which `socket.remoteAddress` reports on
   dual-stack sockets — unmap before checking): loopback 127.0.0.0/8 and ::1/128;
   RFC1918 10/8, 172.16/12, 192.168/16; link-local 169.254/16 (metadata
   169.254.169.254 included) and fe80::/10; CGNAT 100.64/10; 192.0.0.0/24;
   benchmarking 198.18.0.0/15; multicast 224.0.0.0/4 and ff00::/8; broadcast
   255.255.255.255/32; unspecified 0.0.0.0/8 and ::/128; ULA fc00::/7; documentation
   ranges 192.0.2.0/24, 198.51.100.0/24, 203.0.113.0/24.
5. **`packages/core` package.json contract**: deps `@factory/auth` `@factory/config`
   `@factory/db` (workspace:*), `undici ^8`, `zod ^4`, `server-only`; peerDeps
   `next ^15`; devDeps `next ^15.5.23`, `@types/node ^22`, `typescript ~6.0.3`,
   `vitest ^4`, `tsx`.
6. **Security-gate pre-verification (before the CI wiring is committed)**: run gitleaks
   LOCALLY over the full history; commit a `.gitleaks.toml` path-allowlisting
   `.env.example`, `docs/**` (research docs + plan contain deliberate example
   keys/connection strings). Run `pnpm audit --prod --audit-level high` locally; resolve
   or record any current failure BEFORE the gate lands. CI must use the same config.
7. **Type-level proof**: a compile-time type-test file in packages/core (vitest
   `expectTypeOf` and/or `// @ts-expect-error` fixtures) proving: public handler without
   `rateLimit` fails to compile; `auth:'required'` → non-nullable `ctx.session`;
   `input` schema infers `ctx.input`; `input:'none'` → `ctx.input: undefined`. If the
   single-signature union degrades inference, falling back to TWO OVERLOADS is
   pre-approved — the proofs stay the same.
8. Handler return type: `Promise<unknown>` with the doc comment + runtime
   `instanceof Response` check (the `Response | unknown` union is decorative — don't
   write it).
9. `params` type: `Record<string, string | string[] | undefined>` (optional catch-alls).
10. `getClientIp(req)` is a pinned exported helper of packages/core (D.4 order rules) —
    one implementation, used by the wrapper; documented spoofability caveat.
11. Origin comparison source: `APP_URL` when set, else `Host` header; reject
    `Sec-Fetch-Site: cross-site` when the header is present. Absent both → pass.
12. Wrapper-input ZodErrors → 400 at the parse site only; ZodError from inside the
    user handler stays 500 (see rewritten D.4 order).
13. **defineAction input**: `rawInput instanceof FormData` is converted via
    `Object.fromEntries(rawInput.entries())` before the zod parse; documented.
14. **Middleware pins**: matcher `"/((?!_next/static|_next/image|favicon.ico).*)"`;
    in-code allowlist exact-match `/`, `/login`, `/signup`, `/api/health` + prefix-match
    `/api/auth/`; `getSessionCookie` verified for BOTH cookie names — dev
    (`better-auth.session_token`) and prod-https (`__Secure-` prefix): cite the prefix
    logic from better-auth source in a comment AND verify via one HTTPS-simulated check
    (e.g. `x-forwarded-proto: https` request against prod server) or better-auth source
    reading during verification.
15. Guarded-zones job: read the PR body via env var (injection-safe), tolerate null body.
16. Boundary fixtures: ONE deliberate-violation fixture PER rule class (vendor-SDK leak,
    `@factory/config/node` from app code, DAG-edge violation) — each must fail
    `pnpm boundaries` before the rule is trusted; fixtures are temporary during
    verification, not committed.
17. **`webhook` option**: OMITTED from the M3 types entirely (optional never-used keys
    weaken excess-property checks that correction 7 relies on). M7 adds it.

### D.10 Accepted deviations & post-review fixes (discovered during implementation)

- **`drizzle-orm` added to `packages/core` deps** — the atomic rate-limit upsert needs
  `sql`/operators; raw-string SQL would inject the attacker-influenced subject. Boundary
  rule confines the bare entry to `packages/(db|core)` + test dirs; the driver subpath
  stays db-only (D.9.5 amended).
- **`pg`/`@types/pg` in `packages/core` devDeps** — the integration test builds its own
  disposable Pool; boundary rules exempt `packages/*/test/**` for `pg` and the drizzle
  driver subpath.
- **Supply-chain hardening in `pnpm-workspace.yaml`** (semgrep OWASP findings):
  `minimumReleaseAge: 1440`, `blockExoticSubdeps: true`, `trustPolicy: no-downgrade` with
  a scoped `trustPolicyExclude: [undici-types]` (its old @types/node-pinned releases
  predate provenance); `overrides` pin `sharp>=0.35.0` / `postcss>=8.5.18` to clear three
  transitive high-severity advisories reaching us through `next` (drop when next ships
  patched ranges). CI action refs SHA-pinned; gitleaks/semgrep images version-pinned.
- **Security review (3 BLOCKING, all fixed + re-verified)**: (B1) rate-limit pruning
  deleted other buckets' current windows — now prunes against a fixed 24h floor, not the
  caller's window; (B2) rate-limit bucket keyed on concrete pathname → dynamic-route
  bypass + unbounded row cardinality — now keyed on the derived route PATTERN
  (`deriveRouteName` replaces param values with `:key`); (B3) five raw-handler lint
  bypasses (array/object destructure binding, `let`/`var` reassignment, `route.js`,
  `src/app` layout) — all closed and re-proven by fixture. Plus 6 minors (redirect
  credential stripping + 303/302 method handling in `safeFetch`, bare-drizzle boundary
  tightening, three-dot guarded-zones diff, image pins, stale comments, middleware
  protocol-relative `next=` guard).

---
