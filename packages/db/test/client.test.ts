import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Unit coverage for `getDb`'s `Pool` config (conventions.md security posture: every
 * external call carries an explicit timeout and a bounded retry). No live DB — `pg`'s
 * `Pool` and `drizzle-orm/node-postgres`'s `drizzle` are both mocked, so this only proves
 * the options object `getDb` builds, never a real connection.
 */
const poolState = vi.hoisted(() => ({
  lastConfig: undefined as Record<string, unknown> | undefined,
}));

vi.mock("pg", () => ({
  Pool: class {
    config: Record<string, unknown>;
    constructor(config: Record<string, unknown>) {
      poolState.lastConfig = config;
      this.config = config;
    }
  },
}));

vi.mock("drizzle-orm/node-postgres", () => ({
  drizzle: vi.fn().mockReturnValue({}),
}));

beforeEach(() => {
  vi.resetModules();
  poolState.lastConfig = undefined;
  vi.stubEnv("DATABASE_URL", "postgres://postgres:changeme@localhost:5432/fabulous_factory_dev");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getDb — Pool config", () => {
  it("sets statement_timeout and query_timeout alongside the existing pool/connection bounds", async () => {
    const { getDb } = await import("../src/client");
    getDb();

    expect(poolState.lastConfig).toMatchObject({
      max: 10,
      connectionTimeoutMillis: 10_000,
      idleTimeoutMillis: 30_000,
      statement_timeout: 30_000,
      query_timeout: 35_000,
    });
  });
});
