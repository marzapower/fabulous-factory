import { beforeEach, describe, expect, it, vi } from "vitest";

// Same rationale as check-monitor.test.ts's identical stub: these only ever build opaque
// query-fragment markers that the fake `@factory/db` below resolves by call site, not by
// evaluating the condition — real drizzle-orm never has to run against a fake schema.
vi.mock("drizzle-orm", () => ({
  eq: (a: unknown, b: unknown) => ({ __op: "eq", a, b }),
  and: (...args: unknown[]) => ({ __op: "and", args }),
  desc: (a: unknown) => ({ __op: "desc", a }),
  count: () => ({ __op: "count" }),
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({ __op: "sql", strings, values }),
}));

// `@factory/core`'s barrel also re-exports `defineAction`/`defineHandler`, which import
// `@factory/auth`'s module-scope `betterAuth({...})` instantiation — same reason
// check-monitor.test.ts stubs the barrel directly rather than dragging it in. `ApiError`
// is a plain data class (status/code/message), trivially reproduced here.
vi.mock("@factory/core", () => ({
  ApiError: class ApiError extends Error {
    status: number;
    code: string;
    constructor(status: number, code: string, message?: string) {
      super(message ?? code);
      this.name = "ApiError";
      this.status = status;
      this.code = code;
    }
  },
}));

const fakeSchema = vi.hoisted(() => ({
  monitors: { __table: "monitors" as const },
}));

let monitorCount = 0;
let insertedCount = 0;

interface FakeDbApi {
  select(fields?: unknown): {
    from(table: unknown): { where(cond: unknown): Promise<Array<{ value: number }>> };
  };
  insert(table: unknown): {
    values(row: Record<string, unknown>): { returning(): Promise<unknown[]> };
  };
  execute(fragment: unknown): Promise<void>;
  transaction<T>(fn: (tx: FakeDbApi) => Promise<T>): Promise<T>;
}

function createFakeDb(): FakeDbApi {
  const api: FakeDbApi = {
    select(_fields?: unknown) {
      void _fields;
      return {
        from(_table: unknown) {
          void _table;
          return {
            where(_cond: unknown) {
              void _cond;
              return Promise.resolve([{ value: monitorCount }]);
            },
          };
        },
      };
    },
    insert(_table: unknown) {
      void _table;
      return {
        values(row: Record<string, unknown>) {
          return {
            returning() {
              insertedCount += 1;
              monitorCount += 1;
              return Promise.resolve([
                {
                  id: `monitor-${insertedCount}`,
                  userId: row.userId,
                  name: row.name,
                  url: row.url,
                  lastHash: null,
                  lastContent: null,
                  lastCheckedAt: null,
                  createdAt: new Date(),
                },
              ]);
            },
          };
        },
      };
    },
    execute(_fragment: unknown) {
      void _fragment;
      return Promise.resolve();
    },
    async transaction<T>(fn: (tx: FakeDbApi) => Promise<T>): Promise<T> {
      return fn(api);
    },
  };
  return api;
}

let fakeDb: FakeDbApi;

vi.mock("@factory/db", () => ({
  getDb: () => fakeDb,
  schema: fakeSchema,
}));

import { MAX_MONITORS } from "../src/demo/constants";
import { createMonitorRow } from "../src/demo/queries";

beforeEach(() => {
  monitorCount = 0;
  insertedCount = 0;
  fakeDb = createFakeDb();
});

describe("createMonitorRow — MAX_MONITORS cap (review fix: enforced inside the same tx as the insert)", () => {
  it("inserts normally when under the cap", async () => {
    monitorCount = MAX_MONITORS - 1;

    const row = await createMonitorRow({
      userId: "user-1",
      name: "Example",
      url: "https://example.com",
    });

    expect(row).toMatchObject({ userId: "user-1", name: "Example", url: "https://example.com" });
    expect(insertedCount).toBe(1);
  });

  it("throws monitor_limit_reached at the cap, without inserting", async () => {
    monitorCount = MAX_MONITORS;

    await expect(
      createMonitorRow({ userId: "user-1", name: "Example", url: "https://example.com" }),
    ).rejects.toMatchObject({ status: 422, code: "monitor_limit_reached" });
    expect(insertedCount).toBe(0);
  });

  it("throws once already over the cap (not just exactly at it)", async () => {
    monitorCount = MAX_MONITORS + 5;

    await expect(
      createMonitorRow({ userId: "user-1", name: "Example", url: "https://example.com" }),
    ).rejects.toMatchObject({ status: 422, code: "monitor_limit_reached" });
    expect(insertedCount).toBe(0);
  });
});
