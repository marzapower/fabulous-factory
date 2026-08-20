import path from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    // Package-level default. `client.test.tsx` opts into jsdom per-file via the
    // `// @vitest-environment jsdom` docblock — everything else runs in plain node.
    environment: "node",
  },
  resolve: {
    alias: {
      // The real `server-only` package throws under Node's default export condition.
      // See test/stubs/server-only.ts for why this alias exists.
      "server-only": path.resolve(__dirname, "test/stubs/server-only.ts"),
    },
  },
});
