import { describe, expect, it, vi } from "vitest";

// Same mocking style as `packages/untangle/test/tasks-pipeline.test.ts`: mock the kernel
// boundary by module path rather than dragging in the real `@factory/core` barrel, whose
// import graph reaches `@factory/auth`'s module-scope `betterAuth({...})` and would
// demand a real DATABASE_URL just to unit-test a pure guard.
vi.mock("@factory/core", () => ({
  ApiError: class ApiError extends Error {
    constructor(
      public status: number,
      public code: string,
      message?: string,
    ) {
      super(message ?? code);
    }
  },
}));

import { ApiError } from "@factory/core";

import { assertLlmChatEnabled } from "../src/gate";

describe("assertLlmChatEnabled", () => {
  it("does nothing when enabled is true", () => {
    expect(() => assertLlmChatEnabled(true)).not.toThrow();
  });

  it("throws a 503 llm_disabled ApiError when enabled is false", () => {
    expect(() => assertLlmChatEnabled(false)).toThrow(ApiError);
    expect(() => assertLlmChatEnabled(false)).toThrow(
      expect.objectContaining({ status: 503, code: "llm_disabled" }),
    );
  });
});
