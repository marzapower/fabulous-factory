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
  ssr: {
    // Vitest's default SSR module loader externalizes third-party node_modules packages
    // to Node's own (strict) ESM resolver. next-intl's compiled output imports bare
    // specifiers like `next/server` (no extension) that only resolve under a bundler's
    // lenient resolution (Next's own webpack/Turbopack build, or Vite's own resolver) —
    // never under raw Node ESM. `noExternal` forces Vite to resolve+transform next-intl
    // itself instead of handing it to Node, fixing `createLocaleRouting`'s
    // `next-intl/middleware` import under test (middleware.test.ts).
    noExternal: ["next-intl"],
  },
});
