import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// The workspace root config doesn't turn on vitest's `globals` — every test file imports
// its own `describe`/`it`/`vi` from "vitest" explicitly (see any suite in this package).
// That also means `@testing-library/react`'s own auto-cleanup — which detects a *global*
// `afterEach` — never registers, so unmounted trees from one test's `render()` would leak
// into the next `document.body` within the same file. Unmount explicitly after every test
// that renders, same fix any RTL + non-globals vitest setup needs.
afterEach(() => {
  // This setup file runs for every test in the package, including the plain-`node`-
  // environment suites (middleware, sse, theme, delete-account-plan) that never touch the
  // DOM at all — guard so `cleanup()` is only invoked where there's a `document` to clean.
  if (typeof document !== "undefined") {
    cleanup();
  }
});
