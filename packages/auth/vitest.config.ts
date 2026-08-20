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
      // src/auth.ts (transitively imported by index.ts, not by the pure options.ts tests)
      // pulls in @factory/db, whose "." entry starts with `import "server-only"`. The
      // real `server-only` package throws under Node's default export condition — alias
      // it to @factory/config's shared stub, same as every other package's vitest config.
      "server-only": path.resolve(__dirname, "../config/test/stubs/server-only.ts"),
    },
  },
});
