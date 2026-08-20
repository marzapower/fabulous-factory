import { InngestTestEngine } from "@inngest/test";
import { beforeEach, describe, expect, it, vi } from "vitest";

// --- module-scope side-effect isolation --------------------------------------------
// Importing `../src/demo/monitor-cron` / `../src/demo/monitor-worker` transitively pulls
// in `../src/client` (which builds the module-scope `inngest` client from `getEnv()`)
// and `../src/demo/check-monitor` (which imports `@factory/core`'s barrel — dragging in
// `defineAction`/`defineHandler` and, through them, `@factory/auth`'s module-scope
// `betterAuth({...})` instantiation). None of that is exercised by these tests, which
// only care about the cron/worker orchestration — mocked the same way as
// `check-monitor.test.ts`.
vi.mock("drizzle-orm", () => ({
  eq: (a: unknown, b: unknown) => ({ __op: "eq", a, b }),
  and: (...args: unknown[]) => ({ __op: "and", args }),
  desc: (a: unknown) => ({ __op: "desc", a }),
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({ __op: "sql", strings, values }),
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

const fakeMonitorRows: Array<{ id: string }> = [];

vi.mock("@factory/db", () => ({
  getDb: () => ({
    select: () => ({
      from: () => Promise.resolve(fakeMonitorRows),
    }),
  }),
  schema: { monitors: {}, monitorEvents: {}, user: {} },
}));

vi.mock("@factory/llm", () => ({ generate: vi.fn() }));
vi.mock("@factory/email", () => ({ send: vi.fn() }));
vi.mock("@factory/analytics", () => ({ track: vi.fn() }));
vi.mock("@factory/observability", () => ({ captureException: vi.fn() }));

import { checkMonitor } from "../src/demo/check-monitor";
import { monitorCron } from "../src/demo/monitor-cron";
import { monitorWorker } from "../src/demo/monitor-worker";
import { MONITOR_CHECK_EVENT } from "../src/events";

vi.mock("../src/demo/check-monitor", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/demo/check-monitor")>();
  return { ...actual, checkMonitor: vi.fn() };
});

const mockedCheckMonitor = vi.mocked(checkMonitor);

beforeEach(() => {
  fakeMonitorRows.length = 0;
  mockedCheckMonitor.mockReset();
});

describe("monitorCron", () => {
  it("fans out one MONITOR_CHECK_EVENT per monitor id via a single sendEvent call", async () => {
    const t = new InngestTestEngine({
      function: monitorCron,
      steps: [
        {
          id: "list-monitors",
          handler: () => ["monitor-1", "monitor-2"],
        },
      ],
    });

    const { ctx } = await t.execute();

    expect(ctx.step.sendEvent).toHaveBeenCalledTimes(1);
    expect(ctx.step.sendEvent).toHaveBeenCalledWith("fan-out-checks", [
      { name: MONITOR_CHECK_EVENT, data: { monitorId: "monitor-1" } },
      { name: MONITOR_CHECK_EVENT, data: { monitorId: "monitor-2" } },
    ]);
  });

  it("sends no event when there are no monitors", async () => {
    const t = new InngestTestEngine({
      function: monitorCron,
      steps: [{ id: "list-monitors", handler: () => [] }],
    });

    const { ctx } = await t.execute();

    expect(ctx.step.sendEvent).not.toHaveBeenCalled();
  });
});

describe("monitorWorker", () => {
  it("invokes the checkMonitor pipeline with the triggering event's monitorId", async () => {
    mockedCheckMonitor.mockResolvedValue({ status: "unchanged" });

    const t = new InngestTestEngine({
      function: monitorWorker,
      events: [{ name: MONITOR_CHECK_EVENT, data: { monitorId: "monitor-1" } }],
    });

    const { result } = await t.execute();

    expect(mockedCheckMonitor).toHaveBeenCalledWith("monitor-1");
    expect(result).toEqual({ status: "unchanged" });
  });

  it("maps a MONITOR_NOT_FOUND failure to NonRetriableError", async () => {
    const notFound = new Error("monitor not found") as Error & { code: string };
    notFound.code = "MONITOR_NOT_FOUND";
    mockedCheckMonitor.mockRejectedValue(notFound);

    const t = new InngestTestEngine({
      function: monitorWorker,
      events: [{ name: MONITOR_CHECK_EVENT, data: { monitorId: "missing" } }],
    });

    const { error } = await t.execute();

    // The test engine reconstructs the error from Inngest's over-the-wire JSON error
    // format (`name`/`message`), so this asserts on the reconstructed shape rather than
    // `instanceof NonRetriableError` — the important behavior is that the run stopped
    // as non-retriable, not the exact runtime class identity.
    expect(error).toMatchObject({ name: "NonRetriableError", message: "monitor not found" });
  });
});
