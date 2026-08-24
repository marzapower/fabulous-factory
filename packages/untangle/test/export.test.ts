/**
 * `exportUserData` — every table scoped to the caller's own rows, `run_steps` scoped one
 * hop removed via the caller's own run ids (never a join, never another user's rows), and
 * every `select()` projected to an explicit column list (review fix — mirrors
 * `packages/auth/src/export.ts`'s discipline). Real `../src/schema` table objects are used
 * as the store keys and column identity source (same reason billing's
 * `test/helpers/columns.ts` resolves columns off the REAL schema rather than guessing
 * field names); `drizzle-orm`'s `eq`/`inArray` are mocked to plain predicate markers keyed
 * by the column's own `.name` (its actual db column name — verified directly off
 * `drizzle-orm`'s `Column` class, which sets `this.name = config.name`), spread over the
 * real module so `relations()` (used transitively by `@factory/db/schema`'s `user` table)
 * stays real — same `{ ...actual, ...override }` shape `packages/billing/test/
 * entitlement.test.ts` uses for the same reason. `select()`'s own column-map argument is
 * faked the same way `packages/auth/test/export.test.ts`'s relational-API double projects
 * `columns`: each output key is read off the store row via the corresponding column's
 * `.name`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as schema from "../src/schema";

type Row = Record<string, unknown>;
type Predicate = { __op: "eq" | "inArray"; key: string; value: unknown };
type ColumnMap = Record<string, { name: string }>;

const store = {
  captures: [] as Row[],
  tasks: [] as Row[],
  runs: [] as Row[],
  runSteps: [] as Row[],
};

function tableNameOf(table: unknown): keyof typeof store {
  if (table === schema.captures) return "captures";
  if (table === schema.tasks) return "tasks";
  if (table === schema.runs) return "runs";
  if (table === schema.runSteps) return "runSteps";
  throw new Error("untangle export test double: unrecognized table object");
}

function evalPredicate(pred: Predicate, row: Row): boolean {
  if (pred.__op === "eq") return row[pred.key] === pred.value;
  return Array.isArray(pred.value) && pred.value.includes(row[pred.key]);
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
    eq: (column: { name: string }, value: unknown): Predicate => ({
      __op: "eq",
      key: column.name,
      value,
    }),
    inArray: (column: { name: string }, values: unknown[]): Predicate => ({
      __op: "inArray",
      key: column.name,
      value: values,
    }),
  };
});

vi.mock("@factory/db", () => ({
  getDb: () => ({
    select: (columns?: ColumnMap) => ({
      from: (table: unknown) => ({
        where: (pred: Predicate) =>
          Promise.resolve(
            store[tableNameOf(table)]
              .filter((row) => evalPredicate(pred, row))
              .map((row) => project(row, columns)),
          ),
      }),
    }),
  }),
}));

import { exportUserData } from "../src/export";

beforeEach(() => {
  store.captures = [];
  store.tasks = [];
  store.runs = [];
  store.runSteps = [];
});

describe("exportUserData", () => {
  it("scopes captures, tasks, and runs to the caller's own user_id, projected to explicit columns", async () => {
    store.captures = [
      { id: "c1", user_id: "u1", source: "paste", url: null, raw_text: "mine", created_at: "t1" },
      {
        id: "c2",
        user_id: "u2",
        source: "paste",
        url: null,
        raw_text: "not mine",
        created_at: "t2",
      },
    ];
    store.tasks = [
      { id: "t1", user_id: "u1", title: "mine", status: "open", source: "manual" },
      { id: "t2", user_id: "u2", title: "not mine", status: "open", source: "manual" },
    ];
    store.runs = [
      {
        id: "r1",
        user_id: "u1",
        kind: "capture",
        status: "succeeded",
        driver: "inline",
        error: "boom",
      },
      {
        id: "r2",
        user_id: "u2",
        kind: "capture",
        status: "succeeded",
        driver: "inline",
        error: null,
      },
    ];

    const result = await exportUserData("u1");

    expect(result.captures).toEqual([
      { id: "c1", source: "paste", url: null, rawText: "mine", createdAt: "t1" },
    ]);
    expect(result.tasks).toEqual([
      {
        id: "t1",
        runId: undefined,
        captureId: undefined,
        parentTaskId: undefined,
        title: "mine",
        priority: undefined,
        effortMinutes: undefined,
        dueAt: undefined,
        tag: undefined,
        status: "open",
        source: "manual",
        sourceStart: undefined,
        sourceEnd: undefined,
        createdAt: undefined,
        completedAt: undefined,
      },
    ]);
    expect(result.runs).toEqual([
      {
        id: "r1",
        kind: "capture",
        status: "succeeded",
        driver: "inline",
        totalCostCents: undefined,
        startedAt: undefined,
        finishedAt: undefined,
      },
    ]);
  });

  it("never leaks another user's raw_text (user_id) or the internal runs.error column into the export", async () => {
    store.captures = [{ id: "c1", user_id: "u1", raw_text: "mine" }];
    store.runs = [{ id: "r1", user_id: "u1", kind: "capture", error: "raw internal stack trace" }];

    const result = await exportUserData("u1");

    expect(result.captures).toEqual([
      expect.not.objectContaining({ user_id: expect.anything(), userId: expect.anything() }),
    ]);
    const [runRow] = result.runs as Row[];
    expect(runRow).not.toHaveProperty("error");
  });

  it("scopes run_steps to the caller's own run ids, not another user's, keeping run_steps.error", async () => {
    store.runs = [
      { id: "r1", user_id: "u1", kind: "capture" },
      { id: "r2", user_id: "u2", kind: "capture" },
    ];
    store.runSteps = [
      {
        id: "s1",
        run_id: "r1",
        key: "extract",
        status: "failed",
        source: "llm",
        error: "step failed",
      },
      { id: "s2", run_id: "r2", key: "extract", status: "succeeded", source: "llm", error: null },
    ];

    const result = await exportUserData("u1");

    expect(result.runSteps).toEqual([
      {
        id: "s1",
        runId: "r1",
        key: "extract",
        ordinal: undefined,
        status: "failed",
        source: "llm",
        attempt: undefined,
        model: undefined,
        inputTokens: undefined,
        outputTokens: undefined,
        costCents: undefined,
        durationMs: undefined,
        error: "step failed",
        startedAt: undefined,
        finishedAt: undefined,
      },
    ]);
  });

  it("returns empty run_steps (and skips the query) when the user has no runs", async () => {
    store.runSteps = [{ id: "s1", run_id: "r-orphan", key: "extract" }];

    const result = await exportUserData("u1");

    expect(result.runSteps).toEqual([]);
  });
});
