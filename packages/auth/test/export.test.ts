/**
 * Unit tests for `src/export.ts` against a tiny in-memory `@factory/db` double — not a
 * reuse of `packages/billing/test/helpers`'s query-builder double (that fakes
 * `select().where(eq(...))`; `src/export.ts` deliberately uses Drizzle's RELATIONAL query
 * API instead — `db.query.<table>.findFirst/findMany` — to stay inside the package DAG's
 * `no-bare-drizzle-outside-db-core-billing-brainstorm-untangle` rule, so the shape this
 * double needs to fake is different enough that a from-scratch double is clearer than
 * adapting billing's).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

interface FakeRow {
  id?: string;
  userId?: string;
  name?: string;
  email?: string;
  emailVerified?: boolean;
  createdAt?: Date;
  ipAddress?: string | null;
  userAgent?: string | null;
  expiresAt?: Date;
  providerId?: string;
}

const users: FakeRow[] = [];
const sessions: FakeRow[] = [];
const accounts: FakeRow[] = [];

// Minimal fake of Drizzle's relational query API: `where` callbacks receive a "fields"
// proxy (any property access returns the property name itself, so `user.id` reads as the
// string `"id"`) and an operators object exposing `eq`/`and` as plain predicate builders
// over that same field-name string — enough to evaluate the exact `where` shapes
// `src/export.ts` writes, without a real drizzle-orm AST.
const fieldsProxy = new Proxy({}, { get: (_target, prop: string) => prop }) as Record<
  string,
  string
>;

type Predicate = (row: FakeRow) => boolean;
const operators = {
  eq:
    (field: string, value: unknown): Predicate =>
    (row) =>
      row[field as keyof FakeRow] === value,
  and:
    (...predicates: Predicate[]): Predicate =>
    (row) =>
      predicates.every((p) => p(row)),
};

function pick(row: FakeRow, columns?: Record<string, boolean>): FakeRow {
  if (!columns) return { ...row };
  const projected: FakeRow = {};
  for (const key of Object.keys(columns) as (keyof FakeRow)[]) {
    (projected as Record<string, unknown>)[key] = row[key];
  }
  return projected;
}

function makeTable(store: FakeRow[]) {
  return {
    findFirst(opts: {
      columns?: Record<string, boolean>;
      where?: (f: unknown, o: unknown) => Predicate;
    }) {
      const predicate = opts.where ? opts.where(fieldsProxy, operators) : () => true;
      const row = store.find(predicate);
      return Promise.resolve(row ? pick(row, opts.columns) : undefined);
    },
    findMany(opts: {
      columns?: Record<string, boolean>;
      where?: (f: unknown, o: unknown) => Predicate;
    }) {
      const predicate = opts.where ? opts.where(fieldsProxy, operators) : () => true;
      return Promise.resolve(store.filter(predicate).map((row) => pick(row, opts.columns)));
    },
  };
}

vi.mock("@factory/db", () => ({
  getDb: () => ({
    query: {
      user: makeTable(users),
      session: makeTable(sessions),
      account: makeTable(accounts),
    },
  }),
}));

import { buildAccountExport, hasCredentialAccount } from "../src/export";

beforeEach(() => {
  users.length = 0;
  sessions.length = 0;
  accounts.length = 0;
});

describe("buildAccountExport", () => {
  it("returns the user's own profile, sessions, and accounts, excluding tokens", async () => {
    users.push({
      id: "u1",
      name: "Ada",
      email: "ada@example.com",
      emailVerified: true,
      createdAt: new Date("2026-01-01T00:00:00Z"),
    });
    sessions.push({
      userId: "u1",
      createdAt: new Date("2026-01-02T00:00:00Z"),
      ipAddress: "1.2.3.4",
      userAgent: "test-agent",
      expiresAt: new Date("2026-02-01T00:00:00Z"),
    });
    // A second user's session must never leak into u1's export.
    sessions.push({
      userId: "u2",
      createdAt: new Date("2026-01-03T00:00:00Z"),
      ipAddress: "9.9.9.9",
      userAgent: "other-agent",
      expiresAt: new Date("2026-02-01T00:00:00Z"),
    });
    accounts.push({
      userId: "u1",
      providerId: "credential",
      createdAt: new Date("2026-01-01T00:00:00Z"),
    });
    accounts.push({
      userId: "u2",
      providerId: "google",
      createdAt: new Date("2026-01-01T00:00:00Z"),
    });

    const result = await buildAccountExport("u1");

    expect(result).toEqual({
      user: {
        id: "u1",
        name: "Ada",
        email: "ada@example.com",
        emailVerified: true,
        createdAt: new Date("2026-01-01T00:00:00Z"),
      },
      sessions: [
        {
          createdAt: new Date("2026-01-02T00:00:00Z"),
          ipAddress: "1.2.3.4",
          userAgent: "test-agent",
          expiresAt: new Date("2026-02-01T00:00:00Z"),
        },
      ],
      accounts: [{ providerId: "credential", createdAt: new Date("2026-01-01T00:00:00Z") }],
    });

    // Never includes a token or OAuth-credential field even accidentally.
    expect(result).not.toHaveProperty("sessions.0.token");
    expect(result.sessions[0]).not.toHaveProperty("token");
    expect(result.accounts[0]).not.toHaveProperty("accessToken");
  });

  it("throws when the user doesn't exist", async () => {
    await expect(buildAccountExport("missing")).rejects.toThrow(/no user found/);
  });
});

describe("hasCredentialAccount", () => {
  it("is true when the user has a credential-provider account", async () => {
    accounts.push({ userId: "u1", providerId: "credential", createdAt: new Date() });
    expect(await hasCredentialAccount("u1")).toBe(true);
  });

  it("is false when the user only has social-provider accounts", async () => {
    accounts.push({ userId: "u1", providerId: "google", createdAt: new Date() });
    expect(await hasCredentialAccount("u1")).toBe(false);
  });

  it("is false when the user has no accounts at all", async () => {
    expect(await hasCredentialAccount("u1")).toBe(false);
  });

  it("never matches another user's credential account", async () => {
    accounts.push({ userId: "u2", providerId: "credential", createdAt: new Date() });
    expect(await hasCredentialAccount("u1")).toBe(false);
  });
});
