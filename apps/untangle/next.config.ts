import type { NextConfig } from "next";
import path from "path";

// Env-file note: the documented quickstart puts `.env` at the WORKSPACE ROOT (spec §8.1),
// which Next's own env loading never reads (it only loads from the app directory). That
// file is instead loaded by `@factory/config` itself (`getEnv()` reads the merged view —
// root `.env` under real `process.env`), so the app, the migrator, and doctor share one
// env source with no framework machinery. Don't add an `apps/web/.env`; the root file is
// canonical.

// output: 'standalone' + outputFileTracingRoot give the minimal-boot CI job (and Docker,
// from M8) a deterministic, self-contained server bundle regardless of where the pnpm
// workspace lives on disk.
const nextConfig: NextConfig = {
  output: "standalone",
  transpilePackages: [
    "@factory/config",
    "@factory/auth",
    "@factory/db",
    "@factory/core",
    "@factory/email",
    "@factory/analytics",
    "@factory/observability",
    // M6: the jobs package (and the llm package it pulls in as TS source — an M5 gap
    // that never surfaced because nothing imported @factory/llm from the app yet).
    "@factory/llm",
    "@factory/jobs",
    // Untangle's own domain package (capture/normalize/tasks/runs) — split out of
    // @factory/jobs, which now carries only the generic inngest client + registry.
    "@factory/untangle",
    // M7: billing (stripe SDK confined behind a guarded dynamic import inside the
    // package, per boundary rule stripe-only-in-billing).
    "@factory/billing",
    // The shared UI layer (primitives, auth forms, marketing components) extracted from
    // the three preset apps — TS source, same as every other workspace package here.
    "@factory/ui",
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
  // @factory/observability (runs, ... via @factory/llm -> @factory/untangle).
  // Declaring it here makes Next leave it as a real Node `require` in the server bundle
  // instead of trying to statically bundle it — the fix Next's own docs point at for
  // exactly this warning with Sentry/OTel-style instrumentation packages.
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

export default nextConfig;
