import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  // Workspace-wide safety net: the real `server-only` package throws under Node's default
  // export condition, so any package's tests that transitively import it would detonate.
  // Individual packages may re-declare the same alias in their own vitest config.
  resolve: {
    alias: {
      "server-only": fileURLToPath(
        new URL("./packages/config/test/stubs/server-only.ts", import.meta.url),
      ),
    },
  },
  test: {
    // "benchmarks" (not a glob) — the harness lives directly at benchmarks/kernel-value/,
    // not under a packages/*-style subdirectory layout, so it needs its own explicit
    // entry (see benchmarks/vitest.config.ts).
    projects: ["packages/*", "apps/*", "benchmarks"],
  },
});
