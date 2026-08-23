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
    "@factory/core",
    // The shared UI layer (primitives, auth forms, marketing components) extracted from
    // the three preset apps — TS source, same as every other workspace package here.
    "@factory/ui",
    // db/email/analytics/observability/llm/jobs/billing are deliberately absent: this
    // preset's package.json doesn't declare them (it has no db-backed or paid-feature
    // pages), and Turbopack transpiles workspace packages this app DOES depend on
    // automatically — listing undeclared ones here was stale copy-paste from untangle.
  ],
  outputFileTracingRoot: path.join(__dirname, "../../"),

  // Next 16 auto-generates AGENTS.md/CLAUDE.md on `next dev` when it detects an AI
  // coding agent (server/lib/generate-agent-files.ts) — this repo's own CLAUDE.md/
  // AGENTS.md are hand-authored and checked in, so that generator must never run here.
  agentRules: false,

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
