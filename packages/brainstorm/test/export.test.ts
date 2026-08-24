/**
 * `exportUserData` — every table scoped to the caller's own `user_id`, and every
 * `select()` projected to an explicit column list (review fix — mirrors
 * `packages/auth/src/export.ts`'s discipline). Same test-double shape
 * `packages/untangle/test/export.test.ts` uses: real `../src/schema` table objects as
 * store keys, `drizzle-orm`'s `eq` mocked to a plain predicate marker keyed by the
 * column's own `.name`, spread over the real module so `relations()` (used transitively
 * by `@factory/db/schema`'s `user` table) stays real, and `select()`'s column-map argument
 * faked by projecting each output key off the store row via the corresponding column's
 * `.name`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as schema from "../src/schema";

type Row = Record<string, unknown>;
type Predicate = { key: string; value: unknown };
type ColumnMap = Record<string, { name: string }>;

const store = {
  projects: [] as Row[],
  projectMessages: [] as Row[],
  projectItems: [] as Row[],
};

function tableNameOf(table: unknown): keyof typeof store {
  if (table === schema.projects) return "projects";
  if (table === schema.projectMessages) return "projectMessages";
  if (table === schema.projectItems) return "projectItems";
  throw new Error("brainstorm export test double: unrecognized table object");
}

function project(row: Row, columns?: ColumnMap): Row {
  if (!columns) return { ...row };
  const projected: Row = {};
  for (const key of Object.keys(columns)) {
    projected[key] = row[columns[key].name];
  }
  return projected;
}

vi.mock("drizzle-orm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("drizzle-orm")>();
  return {
    ...actual,
    eq: (column: { name: string }, value: unknown): Predicate => ({ key: column.name, value }),
  };
});

vi.mock("@factory/db", () => ({
  getDb: () => ({
    select: (columns?: ColumnMap) => ({
      from: (table: unknown) => ({
        where: (pred: Predicate) =>
          Promise.resolve(
            store[tableNameOf(table)]
              .filter((row) => row[pred.key] === pred.value)
              .map((row) => project(row, columns)),
          ),
      }),
    }),
  }),
}));

import { exportUserData } from "../src/export";

beforeEach(() => {
  store.projects = [];
  store.projectMessages = [];
  store.projectItems = [];
});

describe("exportUserData", () => {
  it("scopes every table to the caller's own user_id, projected to explicit columns (userId omitted)", async () => {
    store.projects = [
      {
        id: "p1",
        user_id: "u1",
        name: "mine",
        pitch: "a pitch",
        created_at: "t1",
        updated_at: "t2",
      },
      {
        id: "p2",
        user_id: "u2",
        name: "not mine",
        pitch: null,
        created_at: "t1",
        updated_at: "t2",
      },
    ];
    store.projectMessages = [
      {
        id: "m1",
        user_id: "u1",
        project_id: "p1",
        role: "user",
        content: "mine",
        created_at: "t1",
      },
      {
        id: "m2",
        user_id: "u2",
        project_id: "p2",
        role: "user",
        content: "not mine",
        created_at: "t1",
      },
    ];
    store.projectItems = [
      {
        id: "i1",
        user_id: "u1",
        project_id: "p1",
        kind: "idea",
        title: "mine",
        detail: null,
        status: "accepted",
        source: "manual",
        created_at: "t1",
        updated_at: "t2",
      },
      {
        id: "i2",
        user_id: "u2",
        project_id: "p2",
        kind: "idea",
        title: "not mine",
        detail: null,
        status: "accepted",
        source: "manual",
        created_at: "t1",
        updated_at: "t2",
      },
    ];

    const result = await exportUserData("u1");

    expect(result.projects).toEqual([
      { id: "p1", name: "mine", pitch: "a pitch", createdAt: "t1", updatedAt: "t2" },
    ]);
    expect(result.projectMessages).toEqual([
      { id: "m1", projectId: "p1", role: "user", content: "mine", createdAt: "t1" },
    ]);
    expect(result.projectItems).toEqual([
      {
        id: "i1",
        projectId: "p1",
        kind: "idea",
        title: "mine",
        detail: null,
        status: "accepted",
        source: "manual",
        createdAt: "t1",
        updatedAt: "t2",
      },
    ]);
    // `userId` is never part of the projected shape — it's the caller's own id by
    // construction (that's what the `where` clause already scopes on).
    for (const row of [
      ...(result.projects as Row[]),
      ...(result.projectMessages as Row[]),
      ...(result.projectItems as Row[]),
    ]) {
      expect(row).not.toHaveProperty("userId");
      expect(row).not.toHaveProperty("user_id");
    }
  });

  it("returns empty arrays for a user with no rows", async () => {
    const result = await exportUserData("u-none");
    expect(result).toEqual({ projects: [], projectMessages: [], projectItems: [] });
  });
});
