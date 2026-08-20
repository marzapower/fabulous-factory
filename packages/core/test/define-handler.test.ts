import { NextRequest } from "next/server";
import { z } from "zod";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getSession } from "@factory/auth";
import { getEnv } from "@factory/config";

import { defineHandler, deriveRouteName } from "../src/define-handler";
import { checkRateLimit } from "../src/rate-limit";

vi.mock("@factory/auth", () => ({
  getSession: vi.fn(),
}));

vi.mock("@factory/config", () => ({
  getEnv: vi.fn(() => ({})),
}));

vi.mock("../src/rate-limit", () => ({
  checkRateLimit: vi.fn(),
}));

const mockGetSession = vi.mocked(getSession);
const mockGetEnv = vi.mocked(getEnv);
const mockCheckRateLimit = vi.mocked(checkRateLimit);

const FAKE_SESSION = { user: { id: "user-1", email: "a@example.com" }, session: {} } as never;

// Response.json()'s ambient type is `Promise<unknown>` — every place this test file
// needs to reach into a body (rather than just `.toEqual(...)` the whole thing) is one
// of our own error envelopes, so a fixed return shape (not `any`) is enough here.
interface JsonErrorBody {
  error: { code: string; message: string; details?: { issues?: unknown[] } };
}
async function readJson(res: Response): Promise<JsonErrorBody> {
  return res.json() as Promise<JsonErrorBody>;
}

function emptyParams() {
  return { params: Promise.resolve({}) };
}

beforeEach(() => {
  mockGetSession.mockResolvedValue(null);
  mockGetEnv.mockReturnValue({} as never);
  mockCheckRateLimit.mockResolvedValue({ allowed: true, remaining: 9, retryAfterSeconds: 0 });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("defineHandler — auth modes", () => {
  it("public + no session: handler runs with session: null", async () => {
    const handle = defineHandler({
      auth: "public",
      input: "none",
      rateLimit: "none",
      handler: async (ctx) => {
        expect(ctx.session).toBeNull();
        return { ok: true };
      },
    });
    const res = await handle(new NextRequest("http://localhost/api/x"), emptyParams());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("required + no session: 401, handler never runs", async () => {
    const handler = vi.fn();
    const handle = defineHandler({ auth: "required", input: "none", handler });
    const res = await handle(new NextRequest("http://localhost/api/x"), emptyParams());
    expect(res.status).toBe(401);
    expect((await readJson(res)).error.code).toBe("unauthorized");
    expect(handler).not.toHaveBeenCalled();
  });

  it("required + session: handler runs with non-null session", async () => {
    mockGetSession.mockResolvedValue(FAKE_SESSION);
    const handle = defineHandler({
      auth: "required",
      input: "none",
      handler: async (ctx) => {
        expect(ctx.session).toBe(FAKE_SESSION);
        return { ok: true };
      },
    });
    const res = await handle(new NextRequest("http://localhost/api/x"), emptyParams());
    expect(res.status).toBe(200);
  });
});

describe("defineHandler — input validation", () => {
  const schema = z.object({ name: z.string().min(1) });

  it("GET reads input from the query string", async () => {
    const handle = defineHandler({
      auth: "public",
      input: schema,
      rateLimit: "none",
      handler: async (ctx) => ({ got: ctx.input.name }),
    });
    const res = await handle(new NextRequest("http://localhost/api/x?name=Ada"), emptyParams());
    expect(await res.json()).toEqual({ got: "Ada" });
  });

  it("POST reads input from the JSON body", async () => {
    const handle = defineHandler({
      auth: "public",
      input: schema,
      rateLimit: "none",
      handler: async (ctx) => ({ got: ctx.input.name }),
    });
    const res = await handle(
      new NextRequest("http://localhost/api/x", {
        method: "POST",
        body: JSON.stringify({ name: "Ada" }),
        headers: { "content-type": "application/json" },
      }),
      emptyParams(),
    );
    expect(await res.json()).toEqual({ got: "Ada" });
  });

  it("invalid input → 400 invalid_input with an issue list (the wrapper's own parse)", async () => {
    const handle = defineHandler({
      auth: "public",
      input: schema,
      rateLimit: "none",
      handler: async () => ({ shouldNot: "run" }),
    });
    const res = await handle(new NextRequest("http://localhost/api/x?name="), emptyParams());
    expect(res.status).toBe(400);
    const body = await readJson(res);
    expect(body.error.code).toBe("invalid_input");
    expect(body.error.details?.issues?.length).toBeGreaterThan(0);
  });

  it("malformed JSON body → 400 invalid_input", async () => {
    const handle = defineHandler({
      auth: "public",
      input: schema,
      rateLimit: "none",
      handler: async () => ({ shouldNot: "run" }),
    });
    const res = await handle(
      new NextRequest("http://localhost/api/x", { method: "POST", body: "{not json" }),
      emptyParams(),
    );
    expect(res.status).toBe(400);
  });

  it("input: 'none' → ctx.input is undefined", async () => {
    const handle = defineHandler({
      auth: "public",
      input: "none",
      rateLimit: "none",
      handler: async (ctx) => {
        expect(ctx.input).toBeUndefined();
        return {};
      },
    });
    const res = await handle(new NextRequest("http://localhost/api/x"), emptyParams());
    expect(res.status).toBe(200);
  });
});

describe("defineHandler — rate limiting", () => {
  it("skips checkRateLimit entirely when rateLimit is 'none'", async () => {
    const handle = defineHandler({
      auth: "public",
      input: "none",
      rateLimit: "none",
      handler: async () => ({}),
    });
    await handle(new NextRequest("http://localhost/api/x"), emptyParams());
    expect(mockCheckRateLimit).not.toHaveBeenCalled();
  });

  it("uses subject user:{id} when a session exists", async () => {
    mockGetSession.mockResolvedValue(FAKE_SESSION);
    const handle = defineHandler({
      auth: "required",
      input: "none",
      rateLimit: { windowSeconds: 60, max: 5 },
      handler: async () => ({}),
    });
    await handle(new NextRequest("http://localhost/api/x"), emptyParams());
    expect(mockCheckRateLimit).toHaveBeenCalledWith(
      expect.objectContaining({ subject: "user:user-1" }),
    );
  });

  it("uses subject ip:{clientIp} when there is no session", async () => {
    const handle = defineHandler({
      auth: "public",
      input: "none",
      rateLimit: { windowSeconds: 60, max: 5 },
      handler: async () => ({}),
    });
    await handle(
      new NextRequest("http://localhost/api/x", {
        headers: { "x-forwarded-for": "203.0.113.9" },
      }),
      emptyParams(),
    );
    expect(mockCheckRateLimit).toHaveBeenCalledWith(
      expect.objectContaining({ subject: "ip:203.0.113.9" }),
    );
  });

  it("derives the rate-limit name from method + pathname", async () => {
    const handle = defineHandler({
      auth: "public",
      input: "none",
      rateLimit: { windowSeconds: 60, max: 5 },
      handler: async () => ({}),
    });
    await handle(new NextRequest("http://localhost/api/widgets"), emptyParams());
    expect(mockCheckRateLimit).toHaveBeenCalledWith(
      expect.objectContaining({ name: "GET /api/widgets" }),
    );
  });

  it("not allowed → 429 with a Retry-After header, handler never runs", async () => {
    mockCheckRateLimit.mockResolvedValue({ allowed: false, remaining: 0, retryAfterSeconds: 42 });
    const handler = vi.fn();
    const handle = defineHandler({
      auth: "public",
      input: "none",
      rateLimit: { windowSeconds: 60, max: 5 },
      handler,
    });
    const res = await handle(new NextRequest("http://localhost/api/x"), emptyParams());
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("42");
    expect(handler).not.toHaveBeenCalled();
  });

  it("rate limit runs BEFORE the auth decision (429 even for an unauthenticated 'required' route)", async () => {
    mockCheckRateLimit.mockResolvedValue({ allowed: false, remaining: 0, retryAfterSeconds: 1 });
    const handle = defineHandler({
      auth: "required",
      input: "none",
      rateLimit: { windowSeconds: 60, max: 5 },
      handler: async () => ({}),
    });
    const res = await handle(new NextRequest("http://localhost/api/x"), emptyParams());
    expect(res.status).toBe(429);
  });

  // B2: on a dynamic route, every distinct id must share ONE rate-limit bucket, not
  // get its own — otherwise the limit has an unlimited-multiplier bypass and the
  // `rate_limits` table grows one row per distinct id ever requested.
  it("dynamic route segments collapse to a shared, pattern-based bucket name (B2)", async () => {
    const handle = defineHandler({
      auth: "public",
      input: "none",
      rateLimit: { windowSeconds: 60, max: 5 },
      handler: async () => ({}),
    });

    await handle(new NextRequest("http://localhost/api/items/111"), {
      params: Promise.resolve({ id: "111" }),
    });
    await handle(new NextRequest("http://localhost/api/items/222"), {
      params: Promise.resolve({ id: "222" }),
    });

    expect(mockCheckRateLimit).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ name: "GET /api/items/:id" }),
    );
    expect(mockCheckRateLimit).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ name: "GET /api/items/:id" }),
    );
  });
});

describe("deriveRouteName (B2, pure function)", () => {
  it("leaves a static path unchanged", () => {
    expect(deriveRouteName("GET", "/api/widgets", {})).toBe("GET /api/widgets");
  });

  it("collapses a single dynamic segment to :key", () => {
    expect(deriveRouteName("GET", "/api/items/abc123", { id: "abc123" })).toBe(
      "GET /api/items/:id",
    );
  });

  it("collapses a catch-all array param to a single :key placeholder", () => {
    expect(deriveRouteName("GET", "/api/files/a/b/c", { slug: ["a", "b", "c"] })).toBe(
      "GET /api/files/:slug",
    );
  });

  it("collapses multiple distinct params in the same path", () => {
    expect(
      deriveRouteName("GET", "/api/orgs/acme/items/xyz", {
        org: "acme",
        id: "xyz",
      }),
    ).toBe("GET /api/orgs/:org/items/:id");
  });

  it("upper-cases the method", () => {
    expect(deriveRouteName("post", "/api/widgets", {})).toBe("POST /api/widgets");
  });

  it("ignores undefined (absent optional catch-all) param values", () => {
    expect(deriveRouteName("GET", "/api/widgets", { slug: undefined })).toBe("GET /api/widgets");
  });

  it("KNOWN LIMITATION: a literal segment matching a param's value also gets replaced", () => {
    // `123` is both the actual `:id` value (segment 3) AND, coincidentally, an
    // unrelated literal path segment elsewhere (segment 4). This is an accepted
    // false-positive (documented on `deriveRouteName`): it only ever makes the bucket
    // name coarser (more requests sharing one bucket), never finer, so it cannot
    // reintroduce the unbounded-cardinality bug this fix exists to close.
    expect(deriveRouteName("GET", "/api/items/123/123", { id: "123" })).toBe(
      "GET /api/items/:id/:id",
    );
  });
});

describe("defineHandler — origin check", () => {
  const postSchema = "none" as const;

  function post(url: string, headers: Record<string, string> = {}) {
    return new NextRequest(url, { method: "POST", headers });
  }

  it("GET/HEAD skip the origin check entirely, even with a mismatched Origin", async () => {
    const handle = defineHandler({
      auth: "public",
      input: postSchema,
      rateLimit: "none",
      handler: async () => ({ ok: true }),
    });
    const res = await handle(
      new NextRequest("http://localhost/api/x", { headers: { origin: "https://evil.example" } }),
      emptyParams(),
    );
    expect(res.status).toBe(200);
  });

  it("absent Origin header passes (curl, webhooks)", async () => {
    const handle = defineHandler({
      auth: "public",
      input: postSchema,
      rateLimit: "none",
      handler: async () => ({ ok: true }),
    });
    const res = await handle(post("http://localhost/api/x"), emptyParams());
    expect(res.status).toBe(200);
  });

  it("Origin host matches Host header → passes", async () => {
    const handle = defineHandler({
      auth: "public",
      input: postSchema,
      rateLimit: "none",
      handler: async () => ({ ok: true }),
    });
    const res = await handle(
      post("http://localhost/api/x", { origin: "http://localhost", host: "localhost" }),
      emptyParams(),
    );
    expect(res.status).toBe(200);
  });

  it("Origin host mismatched vs Host header → 403 invalid_origin", async () => {
    const handle = defineHandler({
      auth: "public",
      input: postSchema,
      rateLimit: "none",
      handler: async () => ({ ok: true }),
    });
    const res = await handle(
      post("http://localhost/api/x", { origin: "https://evil.example", host: "localhost" }),
      emptyParams(),
    );
    expect(res.status).toBe(403);
    expect((await readJson(res)).error.code).toBe("invalid_origin");
  });

  it("APP_URL, when set, is the comparison source instead of Host", async () => {
    mockGetEnv.mockReturnValue({ APP_URL: "https://app.example.com" } as never);
    const handle = defineHandler({
      auth: "public",
      input: postSchema,
      rateLimit: "none",
      handler: async () => ({ ok: true }),
    });
    const allowed = await handle(
      post("http://localhost/api/x", { origin: "https://app.example.com", host: "localhost" }),
      emptyParams(),
    );
    expect(allowed.status).toBe(200);

    const rejected = await handle(
      post("http://localhost/api/x", { origin: "http://localhost", host: "localhost" }),
      emptyParams(),
    );
    expect(rejected.status).toBe(403);
  });

  it("Sec-Fetch-Site: cross-site is rejected even when Origin matches Host", async () => {
    const handle = defineHandler({
      auth: "public",
      input: postSchema,
      rateLimit: "none",
      handler: async () => ({ ok: true }),
    });
    const res = await handle(
      post("http://localhost/api/x", {
        origin: "http://localhost",
        host: "localhost",
        "sec-fetch-site": "cross-site",
      }),
      emptyParams(),
    );
    expect(res.status).toBe(403);
  });
});

describe("defineHandler — handler return + error shaping", () => {
  it("passes an instanceof Response through unchanged", async () => {
    const handle = defineHandler({
      auth: "public",
      input: "none",
      rateLimit: "none",
      handler: async () => new Response("plain text", { status: 201 }),
    });
    const res = await handle(new NextRequest("http://localhost/api/x"), emptyParams());
    expect(res.status).toBe(201);
    expect(await res.text()).toBe("plain text");
  });

  it("wraps a non-Response return value via Response.json", async () => {
    const handle = defineHandler({
      auth: "public",
      input: "none",
      rateLimit: "none",
      handler: async () => ({ hello: "world" }),
    });
    const res = await handle(new NextRequest("http://localhost/api/x"), emptyParams());
    expect(await res.json()).toEqual({ hello: "world" });
  });

  it("an ApiError thrown by the handler body is shaped by its own status/code", async () => {
    const handle = defineHandler({
      auth: "public",
      input: "none",
      rateLimit: "none",
      handler: async () => {
        throw new (await import("../src/errors")).ApiError(409, "conflict", "Already exists");
      },
    });
    const res = await handle(new NextRequest("http://localhost/api/x"), emptyParams());
    expect(res.status).toBe(409);
    expect((await readJson(res)).error.code).toBe("conflict");
  });

  it("an unexpected error thrown by the handler body → opaque 500, message not leaked", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const handle = defineHandler({
        auth: "public",
        input: "none",
        rateLimit: "none",
        handler: async () => {
          throw new Error("super secret internal detail");
        },
      });
      const res = await handle(new NextRequest("http://localhost/api/x"), emptyParams());
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(JSON.stringify(body)).not.toContain("secret");
    } finally {
      consoleError.mockRestore();
    }
  });

  it("a ZodError thrown from INSIDE the handler body stays a 500, not a 400 (plan D.9.12)", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const innerSchema = z.object({ a: z.string() });
      const handle = defineHandler({
        auth: "public",
        input: "none",
        rateLimit: "none",
        handler: async () => {
          innerSchema.parse({ a: 1 }); // throws a raw ZodError — a bug in the handler
          return {};
        },
      });
      const res = await handle(new NextRequest("http://localhost/api/x"), emptyParams());
      expect(res.status).toBe(500);
    } finally {
      consoleError.mockRestore();
    }
  });

  it("awaits and exposes Next 15 route params", async () => {
    const handle = defineHandler({
      auth: "public",
      input: "none",
      rateLimit: "none",
      handler: async (ctx) => ctx.params,
    });
    const res = await handle(new NextRequest("http://localhost/api/x/1"), {
      params: Promise.resolve({ id: "1", tags: ["a", "b"] }),
    });
    expect(await res.json()).toEqual({ id: "1", tags: ["a", "b"] });
  });
});
