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
  transpilePackages: ["@factory/config", "@factory/auth", "@factory/db"],
  outputFileTracingRoot: path.join(__dirname, "../../"),
};

export default nextConfig;
