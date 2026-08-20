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
      // Same stub as packages/config — see that package's test/stubs/server-only.ts for
      // why the real `server-only` package can't be imported under plain Node/vitest.
      "server-only": path.resolve(__dirname, "../config/test/stubs/server-only.ts"),
    },
  },
});
