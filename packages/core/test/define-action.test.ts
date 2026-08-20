import { headers } from "next/headers";
import { z } from "zod";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getSession } from "@factory/auth";

import { ApiError } from "../src/errors";
import { defineAction } from "../src/define-action";
import { checkRateLimit } from "../src/rate-limit";

vi.mock("@factory/auth", () => ({
  getSession: vi.fn(),
}));

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers()),
}));

vi.mock("../src/rate-limit", () => ({
  checkRateLimit: vi.fn(),
}));

const mockGetSession = vi.mocked(getSession);
const mockHeaders = vi.mocked(headers);
const mockCheckRateLimit = vi.mocked(checkRateLimit);

const FAKE_SESSION = { user: { id: "user-1", email: "a@example.com" }, session: {} } as never;

beforeEach(() => {
  mockGetSession.mockResolvedValue(null);
  mockHeaders.mockResolvedValue(new Headers() as never);
  mockCheckRateLimit.mockResolvedValue({ allowed: true, remaining: 9, retryAfterSeconds: 0 });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("defineAction — never throws", () => {
  it("an unexpected error inside the action body becomes { ok: false, internal_error }, not a throw", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const run = defineAction({
        auth: "public",
        input: "none",
        rateLimit: "none",
        action: async () => {
          throw new Error("super secret internal detail");
        },
      });
      const result = await run(undefined);
      expect(result).toEqual({
        ok: false,
        error: { code: "internal_error", message: "Internal server error" },
      });
      expect(JSON.stringify(result)).not.toContain("secret");
      expect(consoleError).toHaveBeenCalled();
    } finally {
      consoleError.mockRestore();
    }
  });

  it("an ApiError thrown inside the action body is shaped to its own code/message", async () => {
    const run = defineAction({
      auth: "public",
      input: "none",
      rateLimit: "none",
      action: async () => {
        throw new ApiError(409, "conflict", "Already exists");
      },
    });
    const result = await run(undefined);
    expect(result).toEqual({ ok: false, error: { code: "conflict", message: "Already exists" } });
  });
});

describe("defineAction — auth modes", () => {
  it("public + no session: action runs with session: null", async () => {
    const run = defineAction({
      auth: "public",
      input: "none",
      rateLimit: "none",
      action: async (ctx) => {
        expect(ctx.session).toBeNull();
        return "done";
      },
    });
    expect(await run(undefined)).toEqual({ ok: true, data: "done" });
  });

  it("required + no session: { ok: false, unauthorized }, action never runs", async () => {
    const action = vi.fn();
    const run = defineAction({ auth: "required", input: "none", action });
    const result = await run(undefined);
    expect(result).toEqual({
      ok: false,
      error: { code: "unauthorized", message: "Authentication required" },
    });
    expect(action).not.toHaveBeenCalled();
  });

  it("required + session: action runs with the non-null session", async () => {
    mockGetSession.mockResolvedValue(FAKE_SESSION);
    const run = defineAction({
      auth: "required",
      input: "none",
      action: async (ctx) => {
        expect(ctx.session).toBe(FAKE_SESSION);
        return "done";
      },
    });
    expect(await run(undefined)).toEqual({ ok: true, data: "done" });
  });
});

describe("defineAction — input validation", () => {
  const schema = z.object({ name: z.string().min(1) });

  it("valid plain-object input parses and reaches the action", async () => {
    const run = defineAction({
      auth: "public",
      input: schema,
      rateLimit: "none",
      action: async (ctx) => ctx.input.name,
    });
    expect(await run({ name: "Ada" })).toEqual({ ok: true, data: "Ada" });
  });

  it("invalid input → { ok: false, invalid_input, issues }", async () => {
    const run = defineAction({
      auth: "public",
      input: schema,
      rateLimit: "none",
      action: async () => "should not run",
    });
    const result = await run({ name: "" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("invalid_input");
    expect(result.error.issues?.length).toBeGreaterThan(0);
  });

  it("FormData input is converted via Object.fromEntries before the zod parse (plan D.9.13)", async () => {
    const form = new FormData();
    form.set("name", "Ada");
    const run = defineAction({
      auth: "public",
      input: schema,
      rateLimit: "none",
      action: async (ctx) => ctx.input.name,
    });
    expect(await run(form)).toEqual({ ok: true, data: "Ada" });
  });

  it("input: 'none' → ctx.input is undefined", async () => {
    const run = defineAction({
      auth: "public",
      input: "none",
      rateLimit: "none",
      action: async (ctx) => {
        expect(ctx.input).toBeUndefined();
        return "ok";
      },
    });
    expect(await run(undefined)).toEqual({ ok: true, data: "ok" });
  });
});

describe("defineAction — rate limiting", () => {
  it("skips checkRateLimit entirely when rateLimit is 'none'", async () => {
    const run = defineAction({
      auth: "public",
      input: "none",
      rateLimit: "none",
      action: async () => "ok",
    });
    await run(undefined);
    expect(mockCheckRateLimit).not.toHaveBeenCalled();
  });

  it("uses subject user:{id} and the caller-supplied name when a session exists", async () => {
    mockGetSession.mockResolvedValue(FAKE_SESSION);
    const run = defineAction({
      auth: "required",
      input: "none",
      rateLimit: { name: "create-widget", windowSeconds: 60, max: 5 },
      action: async () => "ok",
    });
    await run(undefined);
    expect(mockCheckRateLimit).toHaveBeenCalledWith(
      expect.objectContaining({ name: "create-widget", subject: "user:user-1" }),
    );
  });

  it("uses subject ip:{clientIp} (via next/headers) when there is no session", async () => {
    mockHeaders.mockResolvedValue(new Headers({ "x-forwarded-for": "203.0.113.9" }) as never);
    const run = defineAction({
      auth: "public",
      input: "none",
      rateLimit: { name: "create-widget", windowSeconds: 60, max: 5 },
      action: async () => "ok",
    });
    await run(undefined);
    expect(mockCheckRateLimit).toHaveBeenCalledWith(
      expect.objectContaining({ subject: "ip:203.0.113.9" }),
    );
  });

  it("not allowed → { ok: false, rate_limited }, action never runs", async () => {
    mockCheckRateLimit.mockResolvedValue({ allowed: false, remaining: 0, retryAfterSeconds: 3 });
    const action = vi.fn();
    const run = defineAction({
      auth: "public",
      input: "none",
      rateLimit: { name: "create-widget", windowSeconds: 60, max: 5 },
      action,
    });
    const result = await run(undefined);
    expect(result).toEqual({
      ok: false,
      error: { code: "rate_limited", message: "Too many requests" },
    });
    expect(action).not.toHaveBeenCalled();
  });

  it("rate limit runs BEFORE the auth decision", async () => {
    mockCheckRateLimit.mockResolvedValue({ allowed: false, remaining: 0, retryAfterSeconds: 1 });
    const run = defineAction({
      auth: "required",
      input: "none",
      rateLimit: { name: "create-widget", windowSeconds: 60, max: 5 },
      action: async () => "ok",
    });
    const result = await run(undefined);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("rate_limited");
  });
});
