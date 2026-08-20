import { describe, expect, it } from "vitest";

import { EnvValidationError, parseEnv } from "../src/env";

describe("parseEnv", () => {
  it("returns a validated Env when DATABASE_URL is the only var set", () => {
    const env = parseEnv({ DATABASE_URL: "postgres://user:pass@localhost:5432/db" });
    expect(env.DATABASE_URL).toBe("postgres://user:pass@localhost:5432/db");
    expect(env.APP_URL).toBeUndefined();
  });

  it("passes through every registered optional var when valid", () => {
    const env = parseEnv({
      DATABASE_URL: "postgres://user:pass@localhost:5432/db",
      APP_URL: "https://example.com",
      STRIPE_SECRET_KEY: "sk_test_x",
    });
    expect(env.APP_URL).toBe("https://example.com");
    expect(env.STRIPE_SECRET_KEY).toBe("sk_test_x");
  });

  it("throws EnvValidationError (never a bare zod error) when DATABASE_URL is missing", () => {
    expect(() => parseEnv({})).toThrow(EnvValidationError);
  });

  it("aggregates every invalid var into a single EnvValidationError", () => {
    let caught: unknown;
    try {
      parseEnv({
        // DATABASE_URL missing (required)
        APP_URL: "not-a-url", // malformed
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(EnvValidationError);
    const error = caught as EnvValidationError;
    expect(error.issues.length).toBeGreaterThanOrEqual(2);

    const names = error.issues.map((issue) => issue.name);
    expect(names).toContain("DATABASE_URL");
    expect(names).toContain("APP_URL");

    // Each issue message carries the registry description, not a bare zod stack.
    const databaseIssue = error.issues.find((issue) => issue.name === "DATABASE_URL");
    expect(databaseIssue?.message).toMatch(/postgres connection string/i);

    // A single error, not one thrown per bad var.
    expect(error.message).toContain("DATABASE_URL");
    expect(error.message).toContain("APP_URL");
  });

  it('rejects an empty-string DATABASE_URL as invalid, not merely "unset"', () => {
    expect(() => parseEnv({ DATABASE_URL: "" })).toThrow(EnvValidationError);
  });

  it("normalizes an empty-string optional var to unset (matches doctor.ts's .env treatment)", () => {
    const env = parseEnv({
      DATABASE_URL: "postgres://user:pass@localhost:5432/db",
      APP_URL: "",
    });
    expect(env.APP_URL).toBeUndefined();
  });

  it("rejects an unrecognized LLM_PROFILE value (a typo must surface, not silently pass)", () => {
    let caught: unknown;
    try {
      parseEnv({
        DATABASE_URL: "postgres://user:pass@localhost:5432/db",
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
          LLM_PROFILE: profile,
        }),
      ).not.toThrow();
    }
  });
});
