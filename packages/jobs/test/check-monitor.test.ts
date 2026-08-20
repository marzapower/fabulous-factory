import { beforeEach, describe, expect, it, vi } from "vitest";

// --- drizzle-orm stub -------------------------------------------------------------
// check-monitor.ts uses `eq`/`and`/`desc`/`sql` only to build query fragments that the
// fake `@factory/db` below deliberately ignores (it resolves by TABLE + call site, not
// by evaluating the condition) — these stand in as opaque markers so real drizzle-orm
// (which expects real Column/Table internals) never has to run against the fake schema.
vi.mock("drizzle-orm", () => ({
  eq: (a: unknown, b: unknown) => ({ __op: "eq", a, b }),
  and: (...args: unknown[]) => ({ __op: "and", args }),
  desc: (a: unknown) => ({ __op: "desc", a }),
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({ __op: "sql", strings, values }),
}));

// `@factory/core`'s barrel (src/index.ts) also re-exports `defineAction`/`defineHandler`,
// which import `@factory/auth` — a module-scope `betterAuth({...})` instantiation that
// needs a much bigger environment than this unit test cares about. check-monitor.ts only
// ever uses `safeFetch` (as the *default* fetcher — every test below injects its own via
// `deps.fetcher`, so the real one is never called) and `untrusted` (a trivial wrapper),
// so both are stubbed directly rather than dragging in the whole barrel.
vi.mock("@factory/core", () => ({
  safeFetch: vi.fn(),
  untrusted: (value: unknown) => ({ value, __untrusted: true }),
}));

// --- fake schema -------------------------------------------------------------------
// `vi.hoisted` because `vi.mock("@factory/db", ...)` below embeds this directly in its
// returned object — the factory runs when the mock is set up, which is hoisted above a
// plain top-level `const`, so a plain `const` here would still be in its TDZ.
const fakeSchema = vi.hoisted(() => ({
  monitors: { __table: "monitors" as const },
  monitorEvents: { __table: "monitorEvents" as const },
  user: { __table: "user" as const },
}));

interface MonitorRow {
  id: string;
  userId: string;
  name: string;
  url: string;
  lastHash: string | null;
  lastContent: string | null;
  lastCheckedAt: Date | null;
  createdAt: Date;
}

interface EventRow {
  id: string;
  monitorId: string;
  kind: string;
  summary: string;
  source: string;
  createdAt: Date;
}

// --- fake @factory/db ----------------------------------------------------------------
// Resolves purely by which table `.from()`/`.insert()`/`.update()` targeted (and whether
// `.innerJoin(user, ...)` was chained) — every test scenario deals with exactly one
// monitor id, so there is never an ambiguous query to filter.
function createFakeDb(initial: { monitor?: MonitorRow; events?: EventRow[] }) {
  let monitor: MonitorRow | undefined = initial.monitor;
  const events: EventRow[] = initial.events ? [...initial.events] : [];
  // Snapshotted at insert time (not a live reference into `events`) so a later
  // post-commit UPDATE (e.g. the LLM summary upgrade) never rewrites history here —
  // tests can assert "inserted as X" and "later updated to Y" independently.
  const insertedEvents: EventRow[] = [];
  const eventUpdates: Array<Partial<EventRow>> = [];
  const monitorUpdates: Array<Partial<MonitorRow>> = [];
  let nextEventId = 0;

  function selectChain(fields: unknown, table: { __table: string }) {
    let joinedUser = false;
    let limit: number | undefined;
    const chain = {
      innerJoin(joinTable: unknown, cond: unknown) {
        void joinTable;
        void cond;
        joinedUser = true;
        return chain;
      },
      where(cond: unknown) {
        void cond;
        return chain;
      },
      orderBy(cond: unknown) {
        void cond;
        return chain;
      },
      limit(n: number) {
        limit = n;
        return chain;
      },
      then(resolve: (rows: unknown[]) => void, reject?: (err: unknown) => void) {
        try {
          resolve(resolveRows());
        } catch (err) {
          reject?.(err);
        }
      },
    };

    function resolveRows(): unknown[] {
      if (table.__table === "monitors" && joinedUser) {
        // Owner-email lookup (join to `user`).
        return monitor ? [{ email: `${monitor.userId}@example.com` }] : [];
      }
      if (table.__table === "monitors") {
        return monitor ? [{ ...monitor }] : [];
      }
      if (table.__table === "monitorEvents") {
        const changeEvents = events
          .filter((e) => e.kind === "change")
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        const rows = limit !== undefined ? changeEvents.slice(0, limit) : changeEvents;
        void fields;
        return rows.map((e) => ({ createdAt: e.createdAt }));
      }
      return [];
    }

    return chain;
  }

  function select(fields?: unknown) {
    return {
      from(table: { __table: string }) {
        return selectChain(fields, table);
      },
    };
  }

  function insert(table: { __table: string }) {
    return {
      values(row: Record<string, unknown>) {
        if (table.__table === "monitorEvents") {
          nextEventId += 1;
          const eventRow: EventRow = {
            id: `event-${nextEventId}`,
            monitorId: row.monitorId as string,
            kind: row.kind as string,
            summary: row.summary as string,
            source: row.source as string,
            createdAt: new Date(),
          };
          events.push(eventRow);
          insertedEvents.push({ ...eventRow });
          return {
            returning(fields?: unknown) {
              void fields;
              return Promise.resolve([{ id: eventRow.id }]);
            },
          };
        }
        return Promise.resolve();
      },
    };
  }

  function update(table: { __table: string }) {
    return {
      set(values: Record<string, unknown>) {
        return {
          where(cond: unknown) {
            if (table.__table === "monitors" && monitor) {
              monitorUpdates.push(values as Partial<MonitorRow>);
              monitor = { ...monitor, ...(values as Partial<MonitorRow>) };
            }
            if (table.__table === "monitorEvents") {
              eventUpdates.push(values as Partial<EventRow>);
              // `cond` is the mocked `eq(schema.monitorEvents.id, eventId)` fragment —
              // `.b` carries the id value (see the drizzle-orm stub above).
              const targetId = (cond as { b?: string } | undefined)?.b;
              const target = events.find((e) => e.id === targetId);
              if (target) Object.assign(target, values);
            }
            return Promise.resolve();
          },
        };
      },
    };
  }

  function execute(fragment: unknown) {
    void fragment;
    return Promise.resolve();
  }

  // Named interface (rather than `typeof api` inline) so `transaction`'s `tx` parameter
  // doesn't self-reference the still-being-inferred `api` object literal.
  interface FakeDbApi {
    select: typeof select;
    insert: typeof insert;
    update: typeof update;
    execute: typeof execute;
    transaction<T>(fn: (tx: FakeDbApi) => Promise<T>): Promise<T>;
  }

  const api: FakeDbApi = {
    select,
    insert,
    update,
    execute,
    async transaction<T>(fn: (tx: FakeDbApi) => Promise<T>): Promise<T> {
      return fn(api);
    },
  };

  return {
    db: api,
    state: {
      get monitor() {
        return monitor;
      },
      insertedEvents,
      eventUpdates,
      monitorUpdates,
    },
  };
}

let fakeDb: ReturnType<typeof createFakeDb>;

vi.mock("@factory/db", () => ({
  getDb: () => fakeDb.db,
  schema: fakeSchema,
}));

vi.mock("@factory/config", () => ({
  isEnabled: vi.fn(),
}));

vi.mock("@factory/llm", () => ({
  generate: vi.fn(),
}));

vi.mock("@factory/email", () => ({
  send: vi.fn(),
}));

vi.mock("@factory/analytics", () => ({
  track: vi.fn(),
}));

vi.mock("@factory/observability", () => ({
  captureException: vi.fn(),
}));

import { isEnabled } from "@factory/config";
import { track } from "@factory/analytics";
import { send } from "@factory/email";
import { generate } from "@factory/llm";
import { captureException } from "@factory/observability";

import { checkMonitor, normalizeContent } from "../src/demo/check-monitor";

const mockedIsEnabled = vi.mocked(isEnabled);
const mockedGenerate = vi.mocked(generate);
const mockedSend = vi.mocked(send);
const mockedTrack = vi.mocked(track);
const mockedCaptureException = vi.mocked(captureException);

function baseMonitor(overrides: Partial<MonitorRow> = {}): MonitorRow {
  return {
    id: "monitor-1",
    userId: "user-1",
    name: "Example",
    url: "https://example.com",
    lastHash: null,
    lastContent: null,
    lastCheckedAt: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

function htmlFetcher(html: string, status = 200) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(html),
  });
}

beforeEach(() => {
  mockedIsEnabled.mockReset();
  mockedIsEnabled.mockImplementation(() => false);
  mockedGenerate.mockReset();
  mockedSend.mockReset();
  mockedSend.mockResolvedValue({ delivered: true });
  mockedTrack.mockReset();
  mockedCaptureException.mockReset();
});

describe("checkMonitor — baseline", () => {
  it("stores the first snapshot and records a 'baseline' event, no LLM/email/track", async () => {
    fakeDb = createFakeDb({ monitor: baseMonitor() });

    const outcome = await checkMonitor("monitor-1", {
      fetcher: htmlFetcher("<html><body>Hello world</body></html>"),
    });

    expect(outcome).toEqual({ status: "baseline" });
    expect(fakeDb.state.insertedEvents).toHaveLength(1);
    expect(fakeDb.state.insertedEvents[0]).toMatchObject({
      kind: "baseline",
      source: "none",
      summary: "First snapshot captured",
    });
    expect(fakeDb.state.monitor?.lastHash).toBeTruthy();
    expect(fakeDb.state.monitor?.lastContent).toContain("Hello world");
    expect(mockedGenerate).not.toHaveBeenCalled();
    expect(mockedSend).not.toHaveBeenCalled();
    expect(mockedTrack).not.toHaveBeenCalled();
  });
});

describe("checkMonitor — unchanged (Part A exit criterion)", () => {
  it("only updates last_checked_at, writes no event, and NEVER calls generate", async () => {
    const html = "<html><body>Same content</body></html>";
    const existingHash = await import("node:crypto").then((crypto) =>
      crypto.createHash("sha256").update(normalizeContent(html)).digest("hex"),
    );

    fakeDb = createFakeDb({
      monitor: baseMonitor({ lastHash: existingHash, lastContent: normalizeContent(html) }),
    });

    const outcome = await checkMonitor("monitor-1", { fetcher: htmlFetcher(html) });

    expect(outcome).toEqual({ status: "unchanged" });
    expect(fakeDb.state.insertedEvents).toHaveLength(0);
    expect(fakeDb.state.monitor?.lastCheckedAt).toBeInstanceOf(Date);
    expect(mockedGenerate).not.toHaveBeenCalled();
    expect(mockedSend).not.toHaveBeenCalled();
    expect(mockedTrack).not.toHaveBeenCalled();
  });
});

describe("checkMonitor — changed, llm enabled", () => {
  it("summarizes via generate(), writes a 'change' event, sends email, and tracks", async () => {
    fakeDb = createFakeDb({
      monitor: baseMonitor({ lastHash: "old-hash", lastContent: "Old content here" }),
    });
    mockedIsEnabled.mockImplementation(
      (service: string) => service === "llm" || service === "email",
    );
    mockedGenerate.mockResolvedValue({
      output: "The page now mentions new content.",
      model: "test-model",
      profile: "direct",
      usage: { inputTokens: 10, outputTokens: 5 },
      costCents: 1,
      costSource: "estimated",
      latencyMs: 5,
    } as never);

    const outcome = await checkMonitor("monitor-1", {
      fetcher: htmlFetcher("<html><body>New content here</body></html>"),
    });

    expect(outcome.status).toBe("changed");
    expect(outcome.source).toBe("llm");
    expect(outcome.summary).toBe("The page now mentions new content.");
    expect(mockedGenerate).toHaveBeenCalledTimes(1);
    expect(mockedGenerate.mock.calls[0]?.[0]).toMatchObject({
      quality: "cheap",
      maxCostCents: 5,
      promptId: "monitor-summary",
      maxOutputTokens: 256,
    });
    expect(fakeDb.state.insertedEvents).toHaveLength(1);
    // The event is inserted IN the claim transaction with the diff summary/source
    // (atomic with the claim) and only UPGRADED to the LLM summary afterwards — the
    // insert-time snapshot must show 'diff', the post-commit update must show 'llm'.
    expect(fakeDb.state.insertedEvents[0]).toMatchObject({ kind: "change", source: "diff" });
    expect(fakeDb.state.eventUpdates).toHaveLength(1);
    expect(fakeDb.state.eventUpdates[0]).toMatchObject({
      source: "llm",
      summary: "The page now mentions new content.",
    });
    expect(mockedSend).toHaveBeenCalledTimes(1);
    expect(mockedSend).toHaveBeenCalledWith(
      "change-digest",
      "user-1@example.com",
      expect.objectContaining({ monitorName: "Example", url: "https://example.com" }),
    );
    expect(mockedTrack).toHaveBeenCalledWith("monitor_change_detected", {
      distinctId: "user-1",
      monitorId: "monitor-1",
    });
  });
});

describe("checkMonitor — changed, llm disabled", () => {
  it("falls back to a diff-based summary and never calls generate", async () => {
    fakeDb = createFakeDb({
      monitor: baseMonitor({ lastHash: "old-hash", lastContent: "Old content here" }),
    });
    mockedIsEnabled.mockImplementation((service: string) => service === "email");

    const outcome = await checkMonitor("monitor-1", {
      fetcher: htmlFetcher("<html><body>New content here</body></html>"),
    });

    expect(outcome.status).toBe("changed");
    expect(outcome.source).toBe("diff");
    expect(mockedGenerate).not.toHaveBeenCalled();
    expect(fakeDb.state.insertedEvents[0]).toMatchObject({ kind: "change", source: "diff" });
  });
});

describe("checkMonitor — changed, llm call fails", () => {
  it("falls back to the diff summary, reports the error, and still succeeds", async () => {
    fakeDb = createFakeDb({
      monitor: baseMonitor({ lastHash: "old-hash", lastContent: "Old content here" }),
    });
    mockedIsEnabled.mockImplementation((service: string) => service === "llm");
    mockedGenerate.mockRejectedValue(new Error("provider unavailable"));

    const outcome = await checkMonitor("monitor-1", {
      fetcher: htmlFetcher("<html><body>New content here</body></html>"),
    });

    expect(outcome.status).toBe("changed");
    expect(outcome.source).toBe("diff");
    expect(mockedCaptureException).toHaveBeenCalledTimes(1);
    // Change-event atomicity (review fix): the feed row was written inside the claim
    // transaction, BEFORE the LLM call that just rejected — a post-commit generate()
    // failure never loses the change from the feed, it just leaves the diff summary in
    // place instead of upgrading it. No event update happened.
    expect(fakeDb.state.insertedEvents[0]).toMatchObject({ kind: "change", source: "diff" });
    expect(fakeDb.state.eventUpdates).toHaveLength(0);
  });
});

describe("checkMonitor — email throttle", () => {
  it("skips send() when the previous 'change' event is younger than the throttle window", async () => {
    const recentChange: EventRow = {
      id: "event-recent",
      monitorId: "monitor-1",
      kind: "change",
      summary: "previous change",
      source: "diff",
      createdAt: new Date(Date.now() - 60_000), // 1 minute ago, well under 3600s
    };
    fakeDb = createFakeDb({
      monitor: baseMonitor({ lastHash: "old-hash", lastContent: "Old content here" }),
      events: [recentChange],
    });
    mockedIsEnabled.mockImplementation((service: string) => service === "email");

    const outcome = await checkMonitor("monitor-1", {
      fetcher: htmlFetcher("<html><body>New content here</body></html>"),
    });

    expect(outcome.status).toBe("changed");
    expect(mockedSend).not.toHaveBeenCalled();
    // The feed still records regardless of the throttle.
    expect(fakeDb.state.insertedEvents.some((e) => e.kind === "change")).toBe(true);
  });
});

describe("checkMonitor — missing monitor", () => {
  it("throws a MONITOR_NOT_FOUND error", async () => {
    fakeDb = createFakeDb({ monitor: undefined });

    await expect(
      checkMonitor("missing-monitor", { fetcher: htmlFetcher("<html></html>") }),
    ).rejects.toMatchObject({ message: "monitor not found", code: "MONITOR_NOT_FOUND" });
  });
});

describe("checkMonitor — non-OK HTTP status (review fix)", () => {
  it("rejects on a 503 and writes nothing — an error page must never be hashed as content", async () => {
    fakeDb = createFakeDb({
      monitor: baseMonitor({ lastHash: "old-hash", lastContent: "Old content here" }),
    });

    await expect(
      checkMonitor("monitor-1", { fetcher: htmlFetcher("<html>Service Unavailable</html>", 503) }),
    ).rejects.toThrow(/HTTP 503/);

    expect(fakeDb.state.insertedEvents).toHaveLength(0);
    expect(fakeDb.state.monitorUpdates).toHaveLength(0);
  });
});

describe("checkMonitor — stale-fetch guard (review fix)", () => {
  it("bails out as unchanged when a newer check already committed while this fetch was in flight", async () => {
    // `lastCheckedAt` set to the future relative to when `checkMonitor` will capture its
    // own `fetchStartedAt` — simulates a concurrent, newer check committing mid-fetch.
    const futureCheckedAt = new Date(Date.now() + 60_000);
    fakeDb = createFakeDb({
      monitor: baseMonitor({
        lastHash: "old-hash",
        lastContent: "Old content here",
        lastCheckedAt: futureCheckedAt,
      }),
    });

    const outcome = await checkMonitor("monitor-1", {
      // Content that WOULD read as a change against "old-hash" if the guard didn't fire.
      fetcher: htmlFetcher("<html><body>New content here</body></html>"),
    });

    expect(outcome).toEqual({ status: "unchanged" });
    expect(fakeDb.state.insertedEvents).toHaveLength(0);
    // Never claims over the newer content — the monitor row is untouched.
    expect(fakeDb.state.monitorUpdates).toHaveLength(0);
    expect(fakeDb.state.monitor?.lastCheckedAt).toEqual(futureCheckedAt);
  });
});

describe("normalizeContent", () => {
  it("strips <script> and <style> blocks entirely", () => {
    const html =
      "<html><head><style>body{color:red}</style></head><body><script>alert(1)</script>Hi</body></html>";
    expect(normalizeContent(html)).toBe("Hi");
  });

  it("strips remaining tags", () => {
    expect(normalizeContent("<div><p>Hello <b>world</b></p></div>")).toBe("Hello world");
  });

  it("collapses whitespace and trims", () => {
    expect(normalizeContent("<p>Hello \n\n   world  </p>")).toBe("Hello world");
  });

  it("caps the result at MAX_STORED_CONTENT_CHARS", () => {
    const huge = "a".repeat(300_000);
    expect(normalizeContent(`<p>${huge}</p>`).length).toBe(200_000);
  });
});
