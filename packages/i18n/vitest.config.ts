import path from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    // Package-level default. jsdom suites (navigation.test.tsx) opt in per-file via the
    // `// @vitest-environment jsdom` docblock — everything else runs in plain node, same
    // convention as every sibling package (see packages/config/vitest.config.ts).
    environment: "node",
    // navigation.test.tsx is this package's only DOM-rendering suite; see test/setup.ts
    // for why an explicit cleanup() is needed (same fix as packages/ui/test/setup.ts).
    setupFiles: [path.resolve(__dirname, "test/setup.ts")],
  },
  resolve: {
    alias: {
      // src/server.ts's first line is `import "server-only"` — alias to the shared stub
      // under plain-Node vitest, same as every other package's vitest config.
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
