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
    projects: ["packages/*"],
  },
});
