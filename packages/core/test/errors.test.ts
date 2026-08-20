import { z } from "zod";
import { describe, expect, it, vi } from "vitest";

import { ApiError, shapeError, zodErrorToApiError } from "../src/errors";

// Response.json()'s ambient type is `Promise<unknown>`. Our own error bodies always
// have this shape; a generic default (rather than `any`) keeps this typed without
// tripping `no-explicit-any`, while still allowing a call-site override for shapes that
// don't have a `details` field.
interface JsonErrorBody {
  error: { code: string; message: string; details?: { issues?: unknown[] } };
}
async function readJson<T = JsonErrorBody>(res: Response): Promise<T> {
  return res.json() as Promise<T>;
}

describe("ApiError", () => {
  it("shapes status/code/message into a JSON Response", async () => {
    const err = new ApiError(404, "not_found", "Nothing here");
    const res = err.toResponse();
    expect(res.status).toBe(404);
    const body = await readJson(res);
    expect(body).toEqual({ error: { code: "not_found", message: "Nothing here" } });
  });

  it("falls back to the code as the message when none is given", () => {
    const err = new ApiError(500, "boom");
    expect(err.message).toBe("boom");
  });

  it("includes details only when provided", async () => {
    const withDetails = new ApiError(400, "invalid_input", "Invalid", {
      issues: [{ path: ["a"], message: "required" }],
    });
    const body = await readJson(withDetails.toResponse());
    expect(body.error.details).toEqual({ issues: [{ path: ["a"], message: "required" }] });

    const withoutDetails = new ApiError(400, "invalid_input", "Invalid");
    const bodyNoDetails = await readJson(withoutDetails.toResponse());
    expect(bodyNoDetails.error.details).toBeUndefined();
  });

  it("attaches caller-supplied headers (e.g. Retry-After) to the Response", () => {
    const err = new ApiError(429, "rate_limited", "Too many requests", undefined, {
      "Retry-After": "7",
    });
    const res = err.toResponse();
    expect(res.headers.get("Retry-After")).toBe("7");
  });
});

describe("shapeError", () => {
  it("shapes an ApiError via its own toResponse()", async () => {
    const res = shapeError(new ApiError(403, "forbidden", "No"));
    expect(res.status).toBe(403);
    expect((await readJson(res)).error.code).toBe("forbidden");
  });

  it("shapes any non-ApiError into an opaque 500, never leaking the original message", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const res = shapeError(new Error("some secret internal detail, e.g. a connection string"));
      expect(res.status).toBe(500);
      const body = await readJson(res);
      expect(body).toEqual({ error: { code: "internal_error", message: "Internal server error" } });
      expect(JSON.stringify(body)).not.toContain("secret");
      expect(consoleError).toHaveBeenCalled();
    } finally {
      consoleError.mockRestore();
    }
  });

  it("shapes a bare thrown string/value the same opaque way", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const res = shapeError("not even an Error instance");
      expect(res.status).toBe(500);
    } finally {
      consoleError.mockRestore();
    }
  });

  it("shapes a stray ZodError as an opaque 500, NOT a 400 (plan D.9.12 — that's a handler bug)", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const schema = z.object({ a: z.string() });
      const result = schema.safeParse({ a: 1 });
      const res = shapeError(result.error);
      expect(res.status).toBe(500);
      const body = await readJson(res);
      expect(body.error.code).toBe("internal_error");
    } finally {
      consoleError.mockRestore();
    }
  });
});

describe("zodErrorToApiError", () => {
  it("converts a ZodError into a 400 invalid_input ApiError with an issue list", async () => {
    const schema = z.object({ email: z.string().email() });
    const result = schema.safeParse({ email: "not-an-email" });
    expect(result.success).toBe(false);
    if (result.success) return;

    const apiError = zodErrorToApiError(result.error);
    expect(apiError.status).toBe(400);
    expect(apiError.code).toBe("invalid_input");

    const body = await readJson(apiError.toResponse());
    expect(body.error.details?.issues).toEqual([{ path: ["email"], message: expect.any(String) }]);
  });

  it("normalizes non-string/number path segments defensively", () => {
    const apiError = zodErrorToApiError({
      issues: [{ path: ["a", 0], message: "x" }],
    } as unknown as Parameters<typeof zodErrorToApiError>[0]);
    expect(apiError.details?.issues?.[0].path).toEqual(["a", 0]);
  });
});
