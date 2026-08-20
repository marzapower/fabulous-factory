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
      name: "no-bare-drizzle-outside-db-core",
      severity: "error",
      comment:
        "The bare `drizzle-orm` entry (query-expression builders — `sql`, `eq`, `lt`, " +
        "etc.) is confined to packages/db and packages/core (plan D.4: the rate limiter's " +
        "atomic upsert needs these operators at the call site against @factory/db's " +
        "`getDb()` handle) plus test fixtures. Everywhere else — including apps/web and " +
        "packages/auth — must go through @factory/db instead of importing drizzle-orm " +
        "directly (M2: previously only the node-postgres driver subpath was banned here, " +
        "leaving the bare entry point open to a direct import from outside the DAG's " +
        "intended drizzle-consumers).",
      from: {
        pathNot: "^packages/(db|core)/|^packages/[^/]+/test/",
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
    {
      name: "dag-config-imports-no-workspace-package",
      severity: "error",
      comment: "packages/config is the DAG root — it must not import any other workspace package.",
      from: {
        path: "^packages/config/",
      },
      to: {
        path: "^packages/(auth|db|core)/",
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
        path: "^packages/(auth|core)/",
      },
    },
    {
      name: "dag-auth-imports-only-config-db",
      severity: "error",
      comment:
        "packages/auth may depend on packages/config and packages/db only (DAG: db ← auth). Must not import packages/core (no cycle, plan D.2).",
      from: {
        path: "^packages/auth/",
      },
      to: {
        path: "^packages/core/",
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
