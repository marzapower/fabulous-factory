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
      // src/index.ts's first line is `import "server-only"` — alias to the shared stub
      // under plain-Node vitest, same as every other package's vitest config.
      "server-only": path.resolve(__dirname, "../config/test/stubs/server-only.ts"),
    },
  },
});
