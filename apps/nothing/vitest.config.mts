import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
  },
  ssr: {
    // Vitest's default SSR module loader externalizes third-party node_modules packages
    // to Node's own (strict) ESM resolver. next-intl's compiled output imports bare
    // specifiers like `next/server` (no extension) that only resolve under a bundler's
    // lenient resolution (Next's own webpack/Turbopack build, or Vite's own resolver) —
    // never under raw Node ESM. `noExternal` forces Vite to resolve+transform next-intl
    // itself instead of handing it to Node, fixing `../proxy`'s `next-intl/middleware`
    // import (via `@factory/i18n/middleware`) under test (proxy.test.ts). Same fix as
    // packages/i18n/vitest.config.ts.
    noExternal: ["next-intl"],
  },
});
