/**
 * Architecture boundary rules (design spec §8.4, plan D.5 + D.2 DAG).
 *
 * Run via `pnpm boundaries` (`depcruise apps packages --config .dependency-cruiser.cjs`),
 * wired into `pnpm check` between lint and typecheck.
 *
 * DAG (plan D.2): config ← db ← auth ← core ← web. Nothing imports `apps/*`; `apps/web`
 * may import anything. Vendor-SDK/driver leaks (`better-auth`, `pg`, drizzle-orm's
 * connection subpaths, `undici`) and the `@factory/config/node` poison-free entry are each
 * confined to their owning package, with two narrow, physically-verified subpath
 * exceptions (better-auth/next-js in the framework-mount route, better-auth/cookies in
 * middleware.ts) and one deliberate non-ban (drizzle-orm's pure query-operator entry
 * point, needed in packages/core per plan D.4 — see no-drizzle-driver-outside-db below).
 *
 * NOTE on `process.env` reads: the "no legit source hit remains" invariant (D.5) is
 * enforced by the ESLint `factory/no-process-env` rule (eslint.config.mjs), not here —
 * dependency-cruiser reasons about import edges between modules, not property access
 * inside a module.
 */
module.exports = {
  forbidden: [
    {
      name: "no-better-auth-outside-auth",
      severity: "error",
      comment:
        "better-auth may only be imported directly in packages/auth. Two narrower " +
        "exceptions are carved out below: the framework-mount route (better-auth/next-js " +
        "only) and middleware.ts (better-auth/cookies only, D.9.14 — edge middleware needs " +
        "the lightweight cookie-presence check directly; it cannot depend on packages/auth's " +
        "full session resolution, which hits the database).",
      from: {
        pathNot: [
          "^packages/auth/",
          "^apps/web/app/api/auth/\\[\\.\\.\\.all\\]/route\\.ts$",
          "^apps/web/middleware\\.ts$",
        ],
      },
      to: {
        path: "(^|/)node_modules/better-auth(/|$)",
      },
    },
    {
      name: "auth-route-mount-next-js-subpath-only",
      severity: "error",
      comment:
        "The allowlisted framework-mount file may import better-auth, but only the " +
        "better-auth/next-js subpath (toNextJsHandler) — any other better-auth import " +
        "there defeats the point of the allowlist.",
      from: {
        path: "^apps/web/app/api/auth/\\[\\.\\.\\.all\\]/route\\.ts$",
      },
      to: {
        path: "(^|/)node_modules/better-auth(/|$)",
        // Matched on the PHYSICAL resolved dist path, not the import specifier: pnpm's
        // node_modules layout plus better-auth's own dist tree means "better-auth/next-js"
        // resolves to .../better-auth/dist/integrations/next-js.mjs (verified above via
        // the package's own exports map), not a "next-js/" directory.
        pathNot: "/better-auth/dist/integrations/next-js\\.mjs$",
      },
    },
    {
      name: "middleware-better-auth-cookies-subpath-only",
      severity: "error",
      comment:
        "middleware.ts may import better-auth, but only the better-auth/cookies subpath " +
        "(getSessionCookie) — anything else would pull real session/DB logic into edge " +
        "middleware, defeating the point of the optimistic-only layer (spec §8.5).",
      from: {
        path: "^apps/web/middleware\\.ts$",
      },
      to: {
        path: "(^|/)node_modules/better-auth(/|$)",
        // Physical resolved path, same reasoning as the next-js subpath rule above.
        pathNot: "/better-auth/dist/cookies/index\\.mjs$",
      },
    },
    {
      name: "no-pg-outside-db",
      severity: "error",
      comment:
        "pg (the raw Postgres driver) may only be imported directly in packages/db. " +
        "Integration tests (test/**) are exempt — they build their own disposable Pool " +
        "against TEST_DATABASE_URL, mirroring packages/db's own integration suite.",
      from: {
        pathNot: "^packages/db/|^packages/[^/]+/test/",
      },
      to: {
        path: "(^|/)node_modules/pg(/|$)",
      },
    },
    {
      name: "no-drizzle-driver-outside-db",
      severity: "error",
      comment:
        "drizzle-orm's DRIVER/connection subpaths (node-postgres, and its migrator) may " +
        "only be imported in packages/db — only packages/db is allowed to open a Postgres " +
        "connection. The bare `drizzle-orm` entry point (pure query-expression builders — " +
        "`sql`, `eq`, `lt`, etc. — zero I/O, no connection) is deliberately NOT banned here: " +
        "plan D.4's rate limiter constructs its atomic upsert " +
        "(`onConflictDoUpdate({ set: { count: sql`...` } })`) in packages/core against the " +
        "`getDb()` handle imported from @factory/db, which requires these operators at the " +
        "call site. Banning the whole package would make that contracted implementation " +
        "impossible while adding no real boundary value — the actual connection still only " +
        "ever happens inside packages/db's `getDb()`/migrator.",
      from: {
        pathNot: "^packages/db/|^packages/[^/]+/test/",
      },
      to: {
        path: "(^|/)node_modules/drizzle-orm/node-postgres(/|$|\\.)",
      },
    },
    {
      name: "no-bare-drizzle-outside-db-core-jobs-billing",
      severity: "error",
      comment:
        "The bare `drizzle-orm` entry (query-expression builders — `sql`, `eq`, `lt`, " +
        "etc.) is confined to packages/db, packages/core (plan D.4: the rate limiter's " +
        "atomic upsert), packages/jobs (M11: the run engine's and task domain's queries " +
        "and the per-user pg_advisory_xact_lock(hashtext('run-cap:' || userId)) need the " +
        "operators against `getDb()` — same rationale as core), and packages/billing " +
        "(M7/H.10.4: drizzle-orm is a RUNTIME " +
        "dep of billing — the webhook transaction's dedupe insert and guarded " +
        "subscriptions upsert need the operators against `getDb()`) plus test fixtures. " +
        "Everywhere else — including apps/web and packages/auth — must go through " +
        "@factory/db, @factory/jobs, or @factory/billing instead of importing " +
        "drizzle-orm directly. The actual connection still only ever happens inside " +
        "packages/db's getDb()/migrator.",
      from: {
        pathNot: "^packages/(db|core|jobs|billing)/|^packages/[^/]+/test/",
      },
      to: {
        path: "(^|/)node_modules/drizzle-orm(/|$)",
      },
    },
    {
      name: "config-node-restricted",
      severity: "error",
      comment:
        "@factory/config/node (the server-only-free entry) is for Node scripts and " +
        "packages/db's client only — app code must import the poisoned '.' entry instead " +
        "(a boundary an app-code import would otherwise silently bypass).",
      from: {
        pathNot: ["^packages/[^/]+/scripts/", "^packages/db/src/", "^packages/config/"],
      },
      to: {
        path: "^packages/config/src/node\\.ts$",
      },
    },
    {
      name: "no-package-imports-from-apps",
      severity: "error",
      comment: "No package may import from apps/* — dependencies flow the other way.",
      from: {
        path: "^packages/",
      },
      to: {
        path: "^apps/",
      },
    },
    // ---- Closed-form DAG allowlists (plan G.3.1 — M5 review follow-up) ----
    //
    // Every `dag-*` rule below is DENY-BY-DEFAULT: `from` pins one package, `to` bans
    // ALL of `^packages/` except an explicit `pathNot` allowlist (which always includes
    // the package itself — self-imports through the workspace alias are harmless and
    // shouldn't need a carve-out per rule). A brand-new package therefore gets ZERO
    // workspace import access until a maintainer explicitly widens some other package's
    // `pathNot` to admit it — the previous shape (each rule hand-listing the packages
    // IT bans) silently missed newly-added packages instead: `dag-config-imports-no-
    // workspace-package` had to be patched in M5 (plan F.10.13) because
    // email/analytics/observability/llm were absent from its ban list, and this same gap
    // recurred at M4 for the M2/M3-era packages. Deny-by-default makes that class of gap
    // structurally impossible — an omission now under-ALLOWS instead of under-BANS.
    // Order mirrors the DAG itself: config ← db ← {auth,email,analytics,observability} ←
    // core ← llm ← jobs ← web (web is an app, unrestricted — no rule needed).
    {
      name: "dag-config-imports-no-workspace-package",
      severity: "error",
      comment: "packages/config is the DAG root — it must not import any other workspace package.",
      from: {
        path: "^packages/config/",
      },
      to: {
        path: "^packages/",
        pathNot: "^packages/config/",
      },
    },
    {
      name: "dag-db-imports-only-config",
      severity: "error",
      comment: "packages/db may depend on packages/config only (DAG: config ← db).",
      from: {
        path: "^packages/db/",
      },
      to: {
        path: "^packages/",
        pathNot: "^packages/(config|db)/",
      },
    },
    {
      name: "dag-auth-imports-config-db-email",
      severity: "error",
      comment:
        "packages/auth may depend on packages/config, packages/db, and (from M4) " +
        "packages/email (sendVerificationEmail/sendMagicLink). Must NOT import " +
        "packages/core (no cycle, plan D.2) or analytics/observability/llm/jobs.",
      from: {
        path: "^packages/auth/",
      },
      to: {
        path: "^packages/",
        pathNot: "^packages/(config|db|email|auth)/",
      },
    },
    {
      name: "dag-core-imports-config-db-auth",
      severity: "error",
      comment:
        "packages/core may depend on packages/config, packages/db, and packages/auth " +
        "(plan D.2/F.2.1). Must NOT import llm — llm sits ABOVE core in the DAG (config ← " +
        "db ← {auth,email,observability} ← core ← llm ← jobs ← web); the reverse edge " +
        "would be a cycle via @factory/core/untrusted (subsumes the former standalone " +
        "dag-core-no-llm rule — now just an omission from this allowlist, per the " +
        "deny-by-default rationale above).",
      from: {
        path: "^packages/core/",
      },
      to: {
        path: "^packages/",
        pathNot: "^packages/(config|db|auth|core)/",
      },
    },
    {
      name: "undici-only-in-core",
      severity: "error",
      comment: "undici (safeFetch's SSRF-safe fetch mechanism) is confined to packages/core.",
      from: {
        pathNot: "^packages/core/",
      },
      to: {
        path: "(^|/)node_modules/undici(/|$)",
      },
    },
    {
      name: "dag-email-imports-only-config",
      severity: "error",
      comment:
        "packages/email may depend on packages/config only (M4/E.7). It must NOT import " +
        "packages/auth — the dependency runs auth → email (sendVerificationEmail), never " +
        "the reverse; an email → auth edge would create a cycle.",
      from: {
        path: "^packages/email/",
      },
      to: {
        path: "^packages/",
        pathNot: "^packages/(config|email)/",
      },
    },
    {
      name: "dag-analytics-imports-only-config",
      severity: "error",
      comment: "packages/analytics may depend on packages/config only (M4/E.7).",
      from: {
        path: "^packages/analytics/",
      },
      to: {
        path: "^packages/",
        pathNot: "^packages/(config|analytics)/",
      },
    },
    {
      name: "dag-observability-imports-only-config",
      severity: "error",
      comment: "packages/observability may depend on packages/config only (M4/E.7).",
      from: {
        path: "^packages/observability/",
      },
      to: {
        path: "^packages/",
        pathNot: "^packages/(config|observability)/",
      },
    },
    {
      name: "resend-only-in-email",
      severity: "error",
      comment:
        "The Resend SDK may only be imported in packages/email (guarded dynamic import — " +
        "never loaded on the disabled/console transports).",
      from: {
        pathNot: "^packages/email/",
      },
      to: {
        path: "(^|/)node_modules/resend(/|$)",
      },
    },
    {
      name: "stripe-only-in-billing",
      severity: "error",
      comment:
        "The stripe SDK may only be imported in packages/billing (guarded dynamic " +
        "import per plan H.10.3 — never loaded on the disabled adapter branch).",
      from: {
        pathNot: "^packages/billing/",
      },
      to: {
        path: "(^|/)node_modules/stripe(/|$)",
      },
    },
    {
      name: "posthog-only-in-analytics",
      severity: "error",
      comment:
        "posthog-node/posthog-js are confined to packages/analytics (server track + client " +
        "bootstrap); everything else goes through @factory/analytics.",
      from: {
        pathNot: "^packages/analytics/",
      },
      to: {
        path: "(^|/)node_modules/posthog-(node|js)(/|$)",
      },
    },
    {
      name: "sentry-only-in-observability",
      severity: "error",
      comment:
        "@sentry/node is confined to packages/observability (guarded dynamic import — " +
        "loaded only when SENTRY_DSN is present).",
      from: {
        pathNot: "^packages/observability/",
      },
      to: {
        path: "(^|/)node_modules/@sentry(/|$)",
      },
    },
    {
      name: "otel-api-only-in-observability",
      severity: "error",
      comment:
        "@opentelemetry/api is confined to packages/observability, the single owner of " +
        "the OTel seam. packages/llm (M5) consumes the tracer AND SpanStatusCode via " +
        "@factory/observability re-exports — post-review fix: the F.2.5 plan let llm " +
        "import the api package directly, but one enum did not justify eroding the seam.",
      from: {
        pathNot: "^packages/observability/",
      },
      to: {
        path: "(^|/)node_modules/@opentelemetry/",
      },
    },
    {
      name: "no-unresolvable-imports",
      severity: "error",
      comment:
        "An import that enhanced-resolve cannot resolve is (in pnpm's strict layout) " +
        "almost always an UNDECLARED dependency — a runtime crash waiting to happen, and " +
        "worse: dependency-cruiser silently skips unresolvable edges, so a vendor-SDK " +
        "import of an undeclared package would slip past every confinement rule in this " +
        'file. Discovered during M5\'s fixture proofs: `import "ai"` from packages/email ' +
        "resolved to nothing and fired nothing.",
      from: {
        path: "^(apps|packages)/",
        // next-env.d.ts is Next-generated and references `next/image-types/global`,
        // which only resolves under the "types" export condition — deliberately excluded
        // from conditionNames below (see the M3 note there). Generated file, exempt.
        pathNot: "(^|/)next-env\\.d\\.ts$",
      },
      to: {
        couldNotResolve: true,
        // apps/web's "@/*" tsconfig alias (shadcn idiom, M2) only ever targets files
        // INSIDE apps/web, so these edges carry no boundary information; depcruise's
        // enhancedResolveOptions schema rejects an `alias` key, and tsc already fails
        // any typo'd "@/..." import — exempting is both safe and the only clean option.
        pathNot: "^@/",
      },
    },
    {
      name: "ai-sdk-only-in-llm",
      severity: "error",
      comment:
        "The Vercel AI SDK core (`ai`) and every provider package (@ai-sdk/*, " +
        "@openrouter/*) are confined to packages/llm (spec §8.4: no LLM provider calls " +
        "outside the gateway). Providers are additionally loaded via guarded dynamic " +
        "import only on their active profile branch (plan F.2.3).",
      from: {
        pathNot: "^packages/llm/",
      },
      to: {
        path: "(^|/)node_modules/(ai|@ai-sdk|@openrouter)(/|$)",
      },
    },
    {
      name: "inngest-only-in-jobs",
      severity: "error",
      comment:
        "inngest (and @inngest/*, e.g. the @inngest/test dev dependency) are confined to " +
        "packages/jobs — the Inngest client, functions, and demo pipeline all live there " +
        "(plan G.4). One narrow exception below: the framework-mount route may import the " +
        "inngest/next subpath only, mirroring the better-auth precedent at the top of this " +
        "file (auth-route-mount-next-js-subpath-only).",
      from: {
        pathNot: ["^packages/jobs/", "^apps/web/app/api/inngest/route\\.ts$"],
      },
      to: {
        path: "(^|/)node_modules/(inngest|@inngest)(/|$)",
      },
    },
    {
      name: "inngest-route-mount-next-subpath-only",
      severity: "error",
      comment:
        "The allowlisted framework-mount file may import inngest, but only the inngest/next " +
        "subpath (serve) — any other inngest import there defeats the point of the " +
        "allowlist. Matched on the PHYSICAL resolved path, same reasoning as the " +
        'better-auth subpath rules above: inngest@4.18.1\'s package.json exports "./next" ' +
        'as { types, import: "./next.js", require: "./next.cjs" } ("type": "module" ' +
        "at the package root) — under this config's conditionNames (node, import, " +
        'require, default; "types" deliberately excluded, same reasoning as the ' +
        "better-auth rule above) enhanced-resolve walks the exports object's OWN key " +
        'order filtered to those conditions, landing on "import" before "require", ' +
        "which resolves to .../node_modules/inngest/next.js — verified directly against " +
        "the installed 4.18.1 dist under pnpm's node_modules layout.",
      from: {
        path: "^apps/web/app/api/inngest/route\\.ts$",
      },
      to: {
        path: "(^|/)node_modules/(inngest|@inngest)(/|$)",
        pathNot: "/inngest/next\\.js$",
      },
    },
    {
      name: "dag-llm-imports-config-db-core-observability",
      severity: "error",
      comment:
        "packages/llm may depend on packages/config, packages/db (llm_calls accounting), " +
        "packages/core (the ./untrusted subpath), and packages/observability (tracer) — " +
        "plan F.2.1. It must NOT import auth, email, analytics, or jobs.",
      from: {
        path: "^packages/llm/",
      },
      to: {
        path: "^packages/",
        pathNot: "^packages/(config|db|core|observability|llm)/",
      },
    },
    {
      name: "dag-jobs-imports-config-db-core-llm-email-analytics-observability",
      severity: "error",
      comment:
        "packages/jobs (M11) may depend on packages/config, packages/db (runs/run_steps/" +
        "captures/tasks), packages/core (safeFetch/untrusted), packages/llm (task " +
        "extraction/triage/decomposition, daily-plan focus), packages/email " +
        "(daily-plan), packages/analytics (track), and packages/observability " +
        "(captureException) — plan G.2.1/K.6. Must NOT import auth — nothing above jobs " +
        "in the DAG except apps/web.",
      from: {
        path: "^packages/jobs/",
      },
      to: {
        path: "^packages/",
        pathNot: "^packages/(config|db|core|llm|email|analytics|observability|jobs)/",
      },
    },
    {
      name: "dag-billing-imports-config-db",
      severity: "error",
      comment:
        "packages/billing (M7) may depend on packages/config and packages/db only " +
        "(plan H.10.9 amends H.2.1/H.2.11: the originally-planned jobs → billing edge is " +
        "DELETED — entitlement is resolved at the apps/web action layer and passed down " +
        "as a plain value, never a second getDb() checkout inside jobs' advisory-locked " +
        "transaction). Only apps/web imports @factory/billing.",
      from: {
        path: "^packages/billing/",
      },
      to: {
        path: "^packages/",
        pathNot: "^packages/(config|db|billing)/",
      },
    },
  ],

  options: {
    doNotFollow: {
      path: "node_modules",
    },
    exclude: {
      path: "(^|/)(\\.next|coverage|migrations/meta)(/|$)",
    },
    tsPreCompilationDeps: true,
    tsConfig: {
      fileName: "tsconfig.base.json",
    },
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      // pnpm workspace packages expose plain-string TS-source `exports` subpaths (e.g.
      // "@factory/config/node" -> "./src/node.ts") with no conditional (import/require)
      // branching — but enhanced-resolve still needs a non-empty conditionNames list to
      // walk the exports algorithm at all. "node" + "import" cover both workspace
      // TS-source subpaths and ordinary package "main"-less exports fields; "default" is
      // the universal fallback condition. Deliberately EXCLUDES "types": vendor packages
      // (e.g. better-auth) list a "types" condition ahead of "default" in their exports
      // object, and enhanced-resolve picks conditions in the exports object's own key
      // order filtered by this list — including "types" here made every better-auth
      // subpath resolve to its `.d.mts` declaration file instead of the real `.mjs`
      // runtime module, which silently defeated the better-auth/next-js subpath rule
      // below (discovered via the D.9.16 deliberate-violation fixture: the narrow rule
      // failed to fire until "types" was removed).
      conditionNames: ["node", "import", "require", "default"],
      mainFields: ["module", "main"],
      extensions: [".ts", ".tsx", ".mjs", ".cjs", ".js", ".json"],
    },
  },
};
