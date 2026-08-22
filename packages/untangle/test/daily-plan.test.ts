import { beforeEach, describe, expect, it, vi } from "vitest";

// Same mocking style as `test/tasks-pipeline.test.ts`: mock every vendor/service boundary
// by module path rather than dragging in the real packages.
vi.mock("@factory/config", () => ({ isEnabled: vi.fn(), getAppUrl: () => "https://example.test" }));
vi.mock("@factory/core", () => ({
  untrusted: (value: unknown) => ({ value, __untrusted: true }),
}));
vi.mock("@factory/llm", () => ({ streamArray: vi.fn() }));
vi.mock("@factory/observability", () => ({ captureException: vi.fn() }));
vi.mock("@factory/email", () => ({ sendRendered: vi.fn() }));

vi.mock("../src/tasks/queries", () => ({
  listOpenTasksForUser: vi.fn(),
  getUserEmail: vi.fn(),
}));

import { isEnabled } from "@factory/config";
import { sendRendered } from "@factory/email";
import { streamArray } from "@factory/llm";
import { captureException } from "@factory/observability";

import { focusStep, gatherStep, notifyStep, type DailyPlanState } from "../src/tasks/daily-plan";
import { getUserEmail, listOpenTasksForUser } from "../src/tasks/queries";

const mockedIsEnabled = vi.mocked(isEnabled);
const mockedStreamArray = vi.mocked(streamArray);
const mockedCaptureException = vi.mocked(captureException);
const mockedSendRendered = vi.mocked(sendRendered);
const mockedListOpenTasks = vi.mocked(listOpenTasksForUser);
const mockedGetUserEmail = vi.mocked(getUserEmail);

function makeCtx() {
  return { runId: "run-1", userId: "user-1", emit: vi.fn() };
}

function task(id: string, title: string) {
  return { id, title, priority: null, effortMinutes: null, dueAt: null, tag: null };
}

function seedState(overrides: Partial<DailyPlanState> = {}): DailyPlanState {
  return { todayIso: "2026-08-21", tasks: [], focused: [], ...overrides };
}

function genResult<T>(output: T) {
  return {
    output,
    model: "test-model",
    profile: "direct" as const,
    usage: { inputTokens: 10, outputTokens: 5 },
    costCents: 1,
    costSource: "estimated" as const,
    latencyMs: 5,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  mockedIsEnabled.mockReturnValue(false);
  mockedSendRendered.mockResolvedValue({ delivered: true });
});

describe("gatherStep", () => {
  it("loads the caller's open tasks and reports source 'none'", async () => {
    mockedListOpenTasks.mockResolvedValue([task("t1", "Call Marco")]);
    const result = await gatherStep.run(seedState(), makeCtx());

    expect(mockedListOpenTasks).toHaveBeenCalledWith("user-1");
    expect(result.state.tasks).toHaveLength(1);
    expect(result.source).toBe("none");
  });
});

describe("focusStep", () => {
  it("skips when there is nothing open — never emails an empty plan", async () => {
    const result = await focusStep.run(seedState({ tasks: [] }), makeCtx());

    expect(result.skipped).toBe(true);
    expect(result.state.focused).toEqual([]);
    expect(mockedStreamArray).not.toHaveBeenCalled();
  });

  it("llm disabled: falls back to the deterministic ordering, no reason lines", async () => {
    const tasks = [task("t1", "A"), task("t2", "B"), task("t3", "C"), task("t4", "D")];
    const result = await focusStep.run(seedState({ tasks }), makeCtx());

    expect(mockedStreamArray).not.toHaveBeenCalled();
    expect(result.source).toBe("heuristic");
    expect(result.state.focused.map((f) => f.id)).toEqual(["t1", "t2", "t3"]);
    // `reason` is null on this path, and the email template must render that deliberately.
    expect(result.state.focused.every((f) => f.reason === null)).toBe(true);
  });

  it("llm path: uses the model's picks and carries its reason lines", async () => {
    mockedIsEnabled.mockImplementation((service: string) => service === "llm");
    const tasks = [task("t1", "A"), task("t2", "B"), task("t3", "C")];
    mockedStreamArray.mockResolvedValue(
      genResult([
        { index: 2, reason: "due today" },
        { index: 0, reason: "blocks the rest" },
      ]),
    );

    const result = await focusStep.run(seedState({ tasks }), makeCtx());

    expect(result.source).toBe("llm");
    expect(result.state.focused.map((f) => f.id)).toEqual(["t3", "t1"]);
    expect(result.state.focused[0]?.reason).toBe("due today");
  });

  it("drops out-of-range and duplicate indices rather than mis-applying them", async () => {
    mockedIsEnabled.mockImplementation((service: string) => service === "llm");
    const tasks = [task("t1", "A"), task("t2", "B")];
    mockedStreamArray.mockResolvedValue(
      genResult([
        { index: 99, reason: "does not exist" },
        { index: 0, reason: "real" },
        { index: 0, reason: "same task again" },
        { index: -1, reason: "negative" },
      ]),
    );

    const result = await focusStep.run(seedState({ tasks }), makeCtx());

    expect(result.state.focused.map((f) => f.id)).toEqual(["t1"]);
  });

  it("a call that returns zero VALID entries degrades to the heuristic ordering", async () => {
    mockedIsEnabled.mockImplementation((service: string) => service === "llm");
    const tasks = [task("t1", "A"), task("t2", "B")];
    // Technically succeeded, told us nothing usable — must not email an empty plan.
    mockedStreamArray.mockResolvedValue(genResult([{ index: 42, reason: "nope" }]));

    const result = await focusStep.run(seedState({ tasks }), makeCtx());

    expect(result.source).toBe("heuristic");
    expect(result.state.focused.map((f) => f.id)).toEqual(["t1", "t2"]);
  });

  it("falls back to the heuristic when streamArray throws, and reports the failure", async () => {
    mockedIsEnabled.mockImplementation((service: string) => service === "llm");
    const tasks = [task("t1", "A")];
    mockedStreamArray.mockRejectedValue(new Error("provider unavailable"));

    const result = await focusStep.run(seedState({ tasks }), makeCtx());

    expect(result.source).toBe("heuristic");
    expect(result.state.focused.map((f) => f.id)).toEqual(["t1"]);
    // Degradation must be visible, never silent.
    expect(mockedCaptureException).toHaveBeenCalled();
  });
});

describe("notifyStep", () => {
  it("email disabled: skips without sending, and never fails the run", async () => {
    const result = await notifyStep.run(seedState({ focused: [] }), makeCtx());

    expect(mockedSendRendered).not.toHaveBeenCalled();
    expect(result.skipped).toBe(true);
  });

  it("skips when the user has no email on file", async () => {
    mockedIsEnabled.mockImplementation((service: string) => service === "email");
    mockedGetUserEmail.mockResolvedValue(undefined);

    const result = await notifyStep.run(seedState(), makeCtx());

    expect(mockedSendRendered).not.toHaveBeenCalled();
    expect(result.skipped).toBe(true);
  });

  it("renders the template locally and sends it to the owner's address", async () => {
    mockedIsEnabled.mockImplementation((service: string) => service === "email");
    mockedGetUserEmail.mockResolvedValue("owner@example.test");
    const focused = [{ id: "t1", title: "Call Marco", dueAt: null, reason: "due today" }];

    const result = await notifyStep.run(seedState({ focused }), makeCtx());

    expect(mockedSendRendered).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "owner@example.test",
        subject: "Your plan for today",
        react: expect.anything(),
      }),
    );
    expect(result.skipped).toBe(false);
  });

  it("an undelivered send does not fail the run", async () => {
    mockedIsEnabled.mockImplementation((service: string) => service === "email");
    mockedGetUserEmail.mockResolvedValue("owner@example.test");
    mockedSendRendered.mockResolvedValue({ delivered: false, reason: "provider-error" });

    await expect(notifyStep.run(seedState(), makeCtx())).resolves.toBeDefined();
  });
});
