import path from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    // Package-level default: track.ts/shutdown.ts/index.ts are server-only and run fine
    // under plain node. A client.tsx test, if added, opts into jsdom per-file via the
    // `// @vitest-environment jsdom` docblock (see packages/config/test/client.test.tsx).
    environment: "node",
  },
  resolve: {
    alias: {
      // index.ts's first line is `import "server-only"`. The real `server-only` package
      // throws under Node's default export condition (it only resolves cleanly under the
      // `react-server` condition Next.js's webpack build sets up) — alias it to
      // @factory/config's shared stub, same as every other package's vitest config.
      "server-only": path.resolve(__dirname, "../config/test/stubs/server-only.ts"),
    },
  },
});
