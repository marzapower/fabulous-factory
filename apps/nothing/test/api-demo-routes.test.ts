import { NextRequest } from "next/server";
import type { NextRouteContext } from "@factory/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// `@factory/core`'s entry point (`packages/core/src/index.ts`) starts with `import
// "server-only"`, which throws under vitest's plain-Node module resolution (it only
// resolves under Next's own `react-server` condition). The root `vitest.config.ts`
// aliases the BARE specifier away workspace-wide, but that alias isn't visible here:
// this app (unlike `@factory/core`) has no direct dependency on `server-only`, so Vite
// can't even resolve the bare specifier "server-only" from this file's own location to
// register a matching mock (verified: `vi.mock("server-only", ...)` from here silently
// misses and the real module still throws). Resolve it the same way Node itself would —
// relative to `@factory/core`, which DOES depend on it — and mock that exact resolved
// path instead, mirroring `packages/config/test/stubs/server-only.ts`'s no-op shape.
// `require` (not a static `import`) inside `vi.hoisted` is load-bearing: this callback
// runs at vitest's hoisted position, ABOVE every static import in this file — a
// statically-imported `createRequire` would still be in its own temporal dead zone here.
const { serverOnlyPath } = vi.hoisted(() => {
  // This callback runs above every static import in this file, so `require` (not a
  // static `import`) is the only way to reach `createRequire` at this point.
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- see above
  const { createRequire } = require("node:module") as typeof import("node:module");
  const require_ = createRequire(import.meta.url);
  return {
    serverOnlyPath: require_.resolve("server-only", { paths: [require_.resolve("@factory/core")] }),
  };
});
vi.mock(serverOnlyPath, () => ({}));

// Both routes under test are `auth: "public"`, so `defineHandler` (packages/core) only
// ever needs `getSession()` to resolve to *something* — it tolerates a null session and
// even a thrown one (see packages/core/test/define-handler.test.ts, "public-arm session
// tolerance"). Importing the REAL `@factory/auth` still isn't safe here though: its
// module-scope `betterAuth({...})` call (`packages/auth/src/auth.ts`) reads
// `BETTER_AUTH_SECRET` via `getEnv()` at import time and throws when it's unset — which
// it is in this test environment (no root `.env`, no CI env for the `quality` job). Mock
// the whole package, exactly like `packages/core/test/define-handler.test.ts` does.
vi.mock("@factory/auth", () => ({
  getSession: vi.fn(async () => null),
}));

// `defineHandler`'s origin check (`packages/core/src/define-handler.ts`,
// `isOriginAllowed`) calls the real `getEnv()` from `@factory/config` whenever a request
// carries an `Origin` header — which every non-webhook browser POST does. The real
// `getEnv()` validates every REGISTERED env var at once (including the required
// `DATABASE_URL`/`BETTER_AUTH_SECRET`) and throws when they're unset, same as
// `packages/core/test/define-handler.test.ts`'s own `vi.mock("@factory/config", ...)`.
// `APP_URL` unset (`undefined`) is exactly what falls this test back to comparing
// `Origin` against `Host`, which is the behavior under test.
vi.mock("@factory/config", () => ({
  getEnv: vi.fn(() => ({})),
}));

// The routes' `rateLimit` option is a real policy (not `"none"`), so `defineHandler`
// calls the real `checkRateLimit` (`packages/core/src/rate-limit.ts`), which calls the
// real `getDb()` (`packages/db`). `getDb()` throws synchronously when `DATABASE_URL` is
// unset (no real connection attempt), and `checkRateLimit` FAILS OPEN on any such error
// (documented on `checkRateLimit`) — so these routes still work end to end without a
// database, at the cost of one `console.error` per call. Suppress that expected noise
// rather than asserting on it; the route's own behavior is what's under test here.
let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  consoleErrorSpy.mockRestore();
  vi.clearAllMocks();
});

/**
 * What Next 16 hands a route handler with NO dynamic segments — see the identical helper
 * and its doc comment in `packages/core/test/define-handler.test.ts`: `params` present
 * as a key, `undefined` as the runtime value, despite the framework's own generated
 * types insisting it's a `Promise`.
 */
function emptyParams(): NextRouteContext {
  return { params: undefined } as unknown as NextRouteContext;
}

describe("POST /api/demo/security-check", () => {
  it("public, valid input → 200 with the address and its blocked verdict", async () => {
    const { POST } = await import("../app/api/demo/security-check/route");
    const res = await POST(
      new NextRequest("http://localhost/api/demo/security-check", {
        method: "POST",
        body: JSON.stringify({ address: "127.0.0.1" }),
        headers: { "content-type": "application/json" },
      }),
      emptyParams(),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ address: "127.0.0.1", blocked: true });
  });

  it("a public, routable (non-loopback) address is reported as NOT blocked", async () => {
    const { POST } = await import("../app/api/demo/security-check/route");
    const res = await POST(
      new NextRequest("http://localhost/api/demo/security-check", {
        method: "POST",
        body: JSON.stringify({ address: "8.8.8.8" }),
        headers: { "content-type": "application/json" },
      }),
      emptyParams(),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ address: "8.8.8.8", blocked: false });
  });

  it("empty address fails the wrapper's own zod validation → 400 invalid_input", async () => {
    const { POST } = await import("../app/api/demo/security-check/route");
    const res = await POST(
      new NextRequest("http://localhost/api/demo/security-check", {
        method: "POST",
        body: JSON.stringify({ address: "" }),
        headers: { "content-type": "application/json" },
      }),
      emptyParams(),
    );
    expect(res.status).toBe(400);
  });
});

describe("POST /api/demo/kernel-echo", () => {
  it("public, valid input → 200 echoing the validated message and observed request headers", async () => {
    const { POST } = await import("../app/api/demo/kernel-echo/route");
    const res = await POST(
      new NextRequest("http://localhost/api/demo/kernel-echo", {
        method: "POST",
        body: JSON.stringify({ message: "hello" }),
        headers: { "content-type": "application/json", origin: "http://localhost" },
      }),
      emptyParams(),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      auth: "public",
      validated: true,
      echoedMessage: "hello",
      originHeader: "http://localhost",
      secFetchSite: null,
    });
  });

  it("empty message fails the wrapper's own zod validation → 400 invalid_input", async () => {
    const { POST } = await import("../app/api/demo/kernel-echo/route");
    const res = await POST(
      new NextRequest("http://localhost/api/demo/kernel-echo", {
        method: "POST",
        body: JSON.stringify({ message: "" }),
        headers: { "content-type": "application/json" },
      }),
      emptyParams(),
    );
    expect(res.status).toBe(400);
  });

  it("cross-site Origin (mismatched Host) is rejected by the wrapper's own origin check → 403", async () => {
    const { POST } = await import("../app/api/demo/kernel-echo/route");
    const res = await POST(
      new NextRequest("http://localhost/api/demo/kernel-echo", {
        method: "POST",
        body: JSON.stringify({ message: "hello" }),
        headers: {
          "content-type": "application/json",
          origin: "https://evil.example",
          host: "localhost",
        },
      }),
      emptyParams(),
    );
    expect(res.status).toBe(403);
  });
});
