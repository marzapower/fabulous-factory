import path from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    environment: "node",
  },
  resolve: {
    alias: {
      // src/index.ts's first line is `import "server-only"`. The real `server-only`
      // package throws under Node's default export condition (it only resolves cleanly
      // under the `react-server` condition Next.js's webpack build sets up); vitest runs
      // under plain Node, so alias it to @factory/config's shared stub, same as every
      // other package's vitest config.
      "server-only": path.resolve(__dirname, "../config/test/stubs/server-only.ts"),
    },
  },
});
