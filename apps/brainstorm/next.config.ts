import type { NextConfig } from "next";
import path from "path";
// The one unavoidable seam (i18n plan D1): next-intl/plugin is bundled at build time
// only, never at runtime — packages/i18n is otherwise the sole legal next-intl import
// site. See i18n/request.ts, handed to the plugin below as the app's own request-config
// path (a per-app relative filesystem path Turbopack needs, not importable across apps).
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

// Env-file note: the documented quickstart puts `.env` at the WORKSPACE ROOT (spec §8.1),
// which Next's own env loading never reads (it only loads from the app directory). That
// file is instead loaded by `@factory/config` itself (`getEnv()` reads the merged view —
// root `.env` under real `process.env`), so the app, the migrator, and doctor share one
// env source with no framework machinery. Don't add an `apps/brainstorm/.env`; the root
// file is canonical.

// output: 'standalone' + outputFileTracingRoot give the minimal-boot CI job (and Docker,
// from M8) a deterministic, self-contained server bundle regardless of where the pnpm
// workspace lives on disk.
const nextConfig: NextConfig = {
  output: "standalone",
  transpilePackages: [
    "@factory/config",
    "@factory/auth",
    "@factory/core",
    // The i18n leaf (`@factory/i18n`, wraps next-intl) this app's package.json now
    // depends on directly (i18n plan §2.1/M3) — Turbopack traces it at build time same
    // as every other workspace package here.
    "@factory/i18n",
    // The shared UI layer (primitives, auth forms, marketing components) extracted from
    // the three preset apps — TS source, same as every other workspace package here.
    "@factory/ui",
    // Brainstorm preset: the domain package this app is actually built on
    // (`@factory/brainstorm`, itself pulling in `@factory/db`/`@factory/llm` as TS
    // source — Turbopack transpiles those transitively, so they don't need their own
    // entries here).
    "@factory/brainstorm",
    // db/email/analytics/observability/llm/jobs/billing are deliberately absent: this
    // preset's package.json doesn't declare them directly, and Turbopack transpiles
    // workspace packages this app DOES depend on (including transitively, e.g. db/llm
    // via @factory/brainstorm above) automatically — listing them here was stale
    // copy-paste from untangle.
  ],
  outputFileTracingRoot: path.join(__dirname, "../../"),

  // Next 16 auto-generates AGENTS.md/CLAUDE.md on `next dev` when it detects an AI
  // coding agent (server/lib/generate-agent-files.ts) — this repo's own CLAUDE.md/
  // AGENTS.md are hand-authored and checked in, so that generator must never run here.
  agentRules: false,

  // @sentry/node (packages/observability's guarded dynamic import, see errors.ts) pulls
  // in @opentelemetry/instrumentation, which uses require-in-the-middle — a Node-only
  // dynamic `require()` hook. Left in the default webpack bundling path, that trips
  // "Critical dependency: require function is used in a way in which dependencies
  // cannot be statically extracted" on every route that transitively imports
  // @factory/observability (dashboard, projects/[id], ... via @factory/llm). Declaring
  // it here makes Next leave it as a real Node `require` in the server bundle instead of
  // trying to statically bundle it — the fix Next's own docs point at for exactly this
  // warning with Sentry/OTel-style instrumentation packages.
  serverExternalPackages: ["@sentry/node"],

  // Security headers (design spec §8.4/§8.5, plan D.6). Deliberately NO Content-Security-
  // Policy in M3: a safe default CSP needs to know the app's actual asset/script origins
  // (nonces, inline-script usage, third-party embeds from later milestones like billing/
  // analytics), and a wrong CSP silently breaks the app rather than failing loudly. This
  // is a tracked follow-up, not an oversight — revisit once M4+'s vendor scripts land.
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          // Sent unconditionally (not gated on production/https): browsers ignore
          // Strict-Transport-Security on a plain-http response, so it's harmless in dev
          // and in the CI minimal-boot check, and one code path instead of an
          // environment branch is simpler to keep correct.
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains",
          },
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
