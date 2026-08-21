import { describe, expect, it } from "vitest";

import { EnvValidationError, parseEnv } from "../src/env";

// 32 hex chars — well over the ≥16-char minimum (I.3.a) and shaped like the documented
// `openssl rand -hex 32` generation idiom. Used everywhere a test needs a VALID secret;
// tests exercising the required/min-length checks themselves omit or shorten it deliberately.
const VALID_SECRET = "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6";

describe("parseEnv", () => {
  it("returns a validated Env when DATABASE_URL and BETTER_AUTH_SECRET are the only vars set", () => {
    const env = parseEnv({
      DATABASE_URL: "postgres://user:pass@localhost:5432/db",
      BETTER_AUTH_SECRET: VALID_SECRET,
    });
    expect(env.DATABASE_URL).toBe("postgres://user:pass@localhost:5432/db");
    expect(env.BETTER_AUTH_SECRET).toBe(VALID_SECRET);
    expect(env.APP_URL).toBeUndefined();
  });

  it("passes through every registered optional var when valid", () => {
    const env = parseEnv({
      DATABASE_URL: "postgres://user:pass@localhost:5432/db",
      BETTER_AUTH_SECRET: VALID_SECRET,
      APP_URL: "https://example.com",
      STRIPE_SECRET_KEY: "sk_test_x",
    });
    expect(env.APP_URL).toBe("https://example.com");
    expect(env.STRIPE_SECRET_KEY).toBe("sk_test_x");
  });

  it("throws EnvValidationError (never a bare zod error) when DATABASE_URL is missing", () => {
    expect(() => parseEnv({ BETTER_AUTH_SECRET: VALID_SECRET })).toThrow(EnvValidationError);
  });

  // Positive coverage for the M8 contract change (I.3.a): BETTER_AUTH_SECRET is now
  // required, exactly like DATABASE_URL — "pg + auth is the minimum".
  it("throws EnvValidationError when BETTER_AUTH_SECRET is missing", () => {
    let caught: unknown;
    try {
      parseEnv({ DATABASE_URL: "postgres://user:pass@localhost:5432/db" });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(EnvValidationError);
    const error = caught as EnvValidationError;
    expect(error.issues.map((issue) => issue.name)).toContain("BETTER_AUTH_SECRET");
  });

  it("rejects a BETTER_AUTH_SECRET shorter than the 16-character minimum", () => {
    let caught: unknown;
    try {
      parseEnv({
        DATABASE_URL: "postgres://user:pass@localhost:5432/db",
        BETTER_AUTH_SECRET: "too-short",
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(EnvValidationError);
    const error = caught as EnvValidationError;
    const issue = error.issues.find((i) => i.name === "BETTER_AUTH_SECRET");
    expect(issue?.message).toMatch(/at least 16 characters/i);
  });

  it("accepts a BETTER_AUTH_SECRET exactly at the 16-character minimum", () => {
    expect(() =>
      parseEnv({
        DATABASE_URL: "postgres://user:pass@localhost:5432/db",
        BETTER_AUTH_SECRET: "0123456789abcdef", // exactly 16 chars
      }),
    ).not.toThrow();
  });

  it("aggregates every invalid var into a single EnvValidationError", () => {
    let caught: unknown;
    try {
      parseEnv({
        // DATABASE_URL and BETTER_AUTH_SECRET both missing (required)
        APP_URL: "not-a-url", // malformed
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(EnvValidationError);
    const error = caught as EnvValidationError;
    expect(error.issues.length).toBeGreaterThanOrEqual(3);

    const names = error.issues.map((issue) => issue.name);
    expect(names).toContain("DATABASE_URL");
    expect(names).toContain("BETTER_AUTH_SECRET");
    expect(names).toContain("APP_URL");

    // Each issue message carries the registry description, not a bare zod stack.
    const databaseIssue = error.issues.find((issue) => issue.name === "DATABASE_URL");
    expect(databaseIssue?.message).toMatch(/postgres connection string/i);

    // A single error, not one thrown per bad var.
    expect(error.message).toContain("DATABASE_URL");
    expect(error.message).toContain("BETTER_AUTH_SECRET");
    expect(error.message).toContain("APP_URL");
  });

  it('rejects an empty-string DATABASE_URL as invalid, not merely "unset"', () => {
    expect(() => parseEnv({ DATABASE_URL: "", BETTER_AUTH_SECRET: VALID_SECRET })).toThrow(
      EnvValidationError,
    );
  });

  it('rejects an empty-string BETTER_AUTH_SECRET as invalid, not merely "unset"', () => {
    expect(() =>
      parseEnv({
        DATABASE_URL: "postgres://user:pass@localhost:5432/db",
        BETTER_AUTH_SECRET: "",
      }),
    ).toThrow(EnvValidationError);
  });

  it("normalizes an empty-string optional var to unset (matches doctor.ts's .env treatment)", () => {
    const env = parseEnv({
      DATABASE_URL: "postgres://user:pass@localhost:5432/db",
      BETTER_AUTH_SECRET: VALID_SECRET,
      APP_URL: "",
    });
    expect(env.APP_URL).toBeUndefined();
  });

  it("rejects an unrecognized LLM_PROFILE value (a typo must surface, not silently pass)", () => {
    let caught: unknown;
    try {
      parseEnv({
        DATABASE_URL: "postgres://user:pass@localhost:5432/db",
        BETTER_AUTH_SECRET: VALID_SECRET,
        LLM_PROFILE: "not-a-real-profile",
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(EnvValidationError);
    const error = caught as EnvValidationError;
    expect(error.issues.map((issue) => issue.name)).toContain("LLM_PROFILE");
  });

  it("accepts every valid LLM_PROFILE value", () => {
    for (const profile of ["local", "openrouter", "direct", "disabled"]) {
      expect(() =>
        parseEnv({
          DATABASE_URL: "postgres://user:pass@localhost:5432/db",
          BETTER_AUTH_SECRET: VALID_SECRET,
          LLM_PROFILE: profile,
        }),
      ).not.toThrow();
    }
  });
});
