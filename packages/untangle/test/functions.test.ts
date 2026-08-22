import { InngestTestEngine } from "@inngest/test";
import { beforeEach, describe, expect, it, vi } from "vitest";

// --- module-scope side-effect isolation --------------------------------------------
// Importing `../src/cron/daily-plan-cron` / `../src/cron/daily-plan-worker`
// transitively pulls in `@factory/jobs` (whose `inngest` client is built from
// `getEnv()`/`getCapabilities()` at module scope), `../schema` (this domain's own
// `captures`/`tasks`/`runs`/`run_steps` tables, which import `@factory/db/schema`'s
// `user` — and THAT pulls in `auth.ts`'s `relations(...)` call, hence the stub below),
// and `../src/runs/*` / `../src/tasks/*` (which import `@factory/db`, `@factory/llm`,
// `@factory/email`) — dragging in far more than these tests, which only care about the
// cron/worker orchestration, need to exercise. None of that is exercised here; it's all
// mocked, the same way `check-monitor.test.ts` (now retired) mocked the demo pipeline's
// dependencies.
vi.mock("drizzle-orm", () => ({
  eq: (a: unknown, b: unknown) => ({ __op: "eq", a, b }),
  and: (...args: unknown[]) => ({ __op: "and", args }),
  desc: (a: unknown) => ({ __op: "desc", a }),
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({ __op: "sql", strings, values }),
  // Only used at schema-definition time (`auth.ts`'s `userRelations`/etc) — never called
  // by anything this test actually exercises, so a stub that satisfies the `{ many, one
  // }` destructure is enough; the functions themselves are never invoked at runtime.
  relations: (_table: unknown, builder: (helpers: unknown) => unknown) =>
    builder({ many: () => undefined, one: () => undefined }),
}));

vi.mock("@factory/core", () => ({
  safeFetch: vi.fn(),
  untrusted: (value: unknown) => ({ value, __untrusted: true }),
}));

vi.mock("@factory/config", () => ({
  getEnv: vi.fn(() => ({
    INNGEST_EVENT_KEY: undefined,
    INNGEST_SIGNING_KEY: undefined,
    INNGEST_DEV: "1",
  })),
  getCapabilities: vi.fn(() => ({ jobs: "inngest" })),
  isEnabled: vi.fn(() => false),
}));

const fakeOpenTaskUserIds: Array<{ userId: string }> = [];

vi.mock("@factory/db", () => ({
  getDb: () => ({
    selectDistinct: () => ({
      from: () => ({
        where: () => Promise.resolve(fakeOpenTaskUserIds),
      }),
    }),
    select: () => ({
      from: () => ({
        where: () => ({
          orderBy: () => ({
            limit: () => Promise.resolve([]),
          }),
        }),
      }),
    }),
  }),
  schema: { tasks: {}, runs: {}, runSteps: {}, user: {} },
}));

vi.mock("@factory/llm", () => ({ generate: vi.fn() }));
vi.mock("@factory/email", () => ({ send: vi.fn(), sendRendered: vi.fn() }));
vi.mock("@factory/observability", () => ({ captureException: vi.fn() }));

vi.mock("../src/runs/queries", () => ({
  createRun: vi.fn(() => Promise.resolve({ id: "run-1" })),
  finishRun: vi.fn(() => Promise.resolve(undefined)),
}));

vi.mock("../src/runs/drivers", () => ({
  durableDriver:
    () =>
    async <T>(_key: string, fn: () => Promise<T>) =>
      fn(),
}));

vi.mock("../src/tasks/daily-plan", () => ({
  dailyPlanPipeline: [],
}));

import { chunk, dailyPlanCron } from "../src/cron/daily-plan-cron";
import { dailyPlanWorker } from "../src/cron/daily-plan-worker";
import { DAILY_PLAN_EVENT } from "../src/events";
import { createRun } from "../src/runs/queries";

const mockedCreateRun = vi.mocked(createRun);

beforeEach(() => {
  fakeOpenTaskUserIds.length = 0;
  mockedCreateRun.mockClear();
});

describe("chunk", () => {
  it("returns an empty array for an empty input", () => {
    expect(chunk([], 500)).toEqual([]);
  });

  it("splits an exact multiple into equally sized chunks", () => {
    const items = Array.from({ length: 1000 }, (_, i) => i);
    const chunks = chunk(items, 500);
    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toHaveLength(500);
    expect(chunks[1]).toHaveLength(500);
    expect(chunks[0][0]).toBe(0);
    expect(chunks[1][0]).toBe(500);
  });

  it("carries the remainder in a shorter final chunk", () => {
    const items = Array.from({ length: 1200 }, (_, i) => i);
    const chunks = chunk(items, 500);
    expect(chunks.map((c) => c.length)).toEqual([500, 500, 200]);
  });

  it("with size 1, returns one single-element chunk per item", () => {
    const chunks = chunk(["a", "b", "c"], 1);
    expect(chunks).toEqual([["a"], ["b"], ["c"]]);
  });
});

describe("dailyPlanCron", () => {
  it("fans out one DAILY_PLAN_EVENT per user id via a single sendEvent call", async () => {
    const t = new InngestTestEngine({
      function: dailyPlanCron,
      steps: [
        {
          id: "list-users",
          handler: () => ["user-1", "user-2"],
        },
      ],
    });

    const { ctx } = await t.execute();

    expect(ctx.step.sendEvent).toHaveBeenCalledTimes(1);
    expect(ctx.step.sendEvent).toHaveBeenCalledWith("fan-out-plans-0", [
      { name: DAILY_PLAN_EVENT, data: { userId: "user-1" } },
      { name: DAILY_PLAN_EVENT, data: { userId: "user-2" } },
    ]);
  });

  it("sends no event when there are no users with open tasks", async () => {
    const t = new InngestTestEngine({
      function: dailyPlanCron,
      steps: [{ id: "list-users", handler: () => [] }],
    });

    const { ctx } = await t.execute();

    expect(ctx.step.sendEvent).not.toHaveBeenCalled();
  });

  it("splits large user counts across chunked sendEvent calls (500/500/200)", async () => {
    const userIds = Array.from({ length: 1200 }, (_, i) => `user-${i}`);
    const t = new InngestTestEngine({
      function: dailyPlanCron,
      steps: [
        { id: "list-users", handler: () => userIds },
        // Explicit mocks for every fan-out chunk (mirroring "list-users" above) — the
        // engine's default step-tool spy calls through to the REAL `step.sendEvent`,
        // which would otherwise attempt a real network send per chunk. Memoizing each
        // chunk's step id here keeps every replay resolved locally, so all 3 sends run.
        { id: "fan-out-plans-0", handler: () => ({ ids: [] }) },
        { id: "fan-out-plans-1", handler: () => ({ ids: [] }) },
        { id: "fan-out-plans-2", handler: () => ({ ids: [] }) },
      ],
    });

    const { ctx } = await t.execute();

    expect(ctx.step.sendEvent).toHaveBeenCalledTimes(3);
    const calls = vi.mocked(ctx.step.sendEvent).mock.calls;
    expect(calls[0][0]).toBe("fan-out-plans-0");
    expect(calls[1][0]).toBe("fan-out-plans-1");
    expect(calls[2][0]).toBe("fan-out-plans-2");
    expect(calls[0][1]).toHaveLength(500);
    expect(calls[1][1]).toHaveLength(500);
    expect(calls[2][1]).toHaveLength(200);
  });
});

describe("dailyPlanWorker", () => {
  it("creates a run for the triggering event's userId via the memoized create-run step", async () => {
    const t = new InngestTestEngine({
      function: dailyPlanWorker,
      events: [{ name: DAILY_PLAN_EVENT, data: { userId: "user-1" } }],
    });

    await t.execute();

    expect(mockedCreateRun).toHaveBeenCalledWith({
      userId: "user-1",
      kind: "daily-plan",
      driver: "durable",
      runsPerDay: null,
      enforceLimit: false,
    });
  });
});
