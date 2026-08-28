import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// Same fix as packages/ui/test/setup.ts: the workspace root config doesn't turn on
// vitest's `globals`, so @testing-library/react's own auto-cleanup (which detects a
// *global* `afterEach`) never registers — unmounted trees from one test's `render()`
// would otherwise leak into the next `document.body` within the same file
// (navigation.test.tsx is this package's only DOM-rendering suite today).
afterEach(() => {
  // Runs for every test in the package, including the plain-`node`-environment suites
  // that never touch the DOM at all — guard so `cleanup()` is only invoked where there's
  // a `document` to clean.
  if (typeof document !== "undefined") {
    cleanup();
  }
});
