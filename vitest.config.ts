import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

// "benchmarks" (not a glob) — the harness lives directly at benchmarks/kernel-value/, not
// under a packages/*-style subdirectory layout, so it needs its own explicit entry (see
// benchmarks/vitest.config.ts). It is also factory-dev-only and never ships to a composed
// product repo, where vitest would hard-fail at startup ("Projects definition references a
// non-existing file or a directory") on an entry that doesn't resolve — hence the presence
// gate rather than an unconditional entry: this file ships verbatim to every scaffold.
const benchmarksDir = fileURLToPath(new URL("./benchmarks", import.meta.url));

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
    projects: ["packages/*", "apps/*", ...(existsSync(benchmarksDir) ? ["benchmarks"] : [])],
  },
});
