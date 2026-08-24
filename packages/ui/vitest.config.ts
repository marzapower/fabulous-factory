import path from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: [path.resolve(__dirname, "test/setup.ts")],
  },
  resolve: {
    alias: {
      // Neither src/middleware.ts nor src/sse.ts imports `server-only`, but other
      // @factory/ui modules (src/auth/*) do, transitively or directly. The real
      // `server-only` package throws under Node's default export condition — alias it to
      // @factory/config's shared stub, same as every other package's vitest config.
      "server-only": path.resolve(__dirname, "../config/test/stubs/server-only.ts"),
    },
  },
});
