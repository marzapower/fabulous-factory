import { describe, expect, it } from "vitest";

import type { LatestRunSummary, TaskListItem } from "@factory/untangle";

import { resolveTodaysPlanState } from "../components/dashboard/todays-plan-state";

const latestRun: LatestRunSummary = {
  id: "run-1",
  status: "succeeded",
  startedAt: new Date("2026-08-23T07:00:00Z"),
  finishedAt: new Date("2026-08-23T07:00:05Z"),
};

const openTask: TaskListItem = {
  id: "t1",
  title: "Call marco",
  priority: "now",
  effortMinutes: 15,
  dueAt: null,
  tag: null,
};

describe("resolveTodaysPlanState", () => {
  it("is 'jobs-off' whenever the jobs capability is disabled, regardless of run/task state", () => {
    expect(resolveTodaysPlanState({ jobsEnabled: false, latestRun: null, openTasks: [] })).toBe(
      "jobs-off",
    );
    expect(resolveTodaysPlanState({ jobsEnabled: false, latestRun, openTasks: [openTask] })).toBe(
      "jobs-off",
    );
  });

  it("is 'no-run-yet' when jobs is on but no daily-plan run has happened yet", () => {
    expect(resolveTodaysPlanState({ jobsEnabled: true, latestRun: null, openTasks: [] })).toBe(
      "no-run-yet",
    );
  });

  it("is 'empty' when jobs is on, a run exists, and there are no open tasks", () => {
    expect(resolveTodaysPlanState({ jobsEnabled: true, latestRun, openTasks: [] })).toBe("empty");
  });

  it("is 'plan' when jobs is on, a run exists, and there are open tasks", () => {
    expect(resolveTodaysPlanState({ jobsEnabled: true, latestRun, openTasks: [openTask] })).toBe(
      "plan",
    );
  });
});
