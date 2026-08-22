import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // templates/ is ephemeral compose output (npx-installer design spec §5): it can hold
    // nested copies of every workspace package's own test/**/*.test.ts files, which would
    // otherwise be picked up and re-run here with regexes/paths that no longer apply.
    exclude: ["**/node_modules/**", "templates/**"],
  },
});
