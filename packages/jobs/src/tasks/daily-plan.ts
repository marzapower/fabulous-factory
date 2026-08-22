/**
 * `dailyPlanPipeline` — the scheduled digest's three-step pipeline (plan K.5.4). Driven
 * by the durable driver from `cron/daily-plan-worker.ts` (T7) — the daily plan is
 * background work, unlike `capturePipeline`, which is always inline (K.1.6).
 */
import { getAppUrl, isEnabled } from "@factory/config";
import { untrusted } from "@factory/core";
import { send } from "@factory/email";
import { streamArray } from "@factory/llm";
import { captureException } from "@factory/observability";

import type { RunStep } from "../runs/engine";
import { formatIndexedList, focusElementSchema, FOCUS_TASK } from "./prompts";
import { getUserEmail, listOpenTasksForUser, type TaskListItem } from "./queries";

const FOCUS_COUNT = 3;
// M5 (binding): always paired with an explicit `maxCostCents`. Value pinned by K.14 M5.
const FOCUS_MAX_OUTPUT_TOKENS = 512;
// Not pinned by the plan — chosen autonomously, modest per call.
const FOCUS_MAX_COST_CENTS = 5;

export interface FocusedTask {
  id: string;
  title: string;
  dueAt: string | null;
  reason: string | null;
}

export interface DailyPlanState {
  todayIso: string;
  tasks: TaskListItem[];
  focused: FocusedTask[];
}

function firstN(tasks: TaskListItem[], n: number): FocusedTask[] {
  return tasks
    .slice(0, n)
    .map((task) => ({ id: task.id, title: task.title, dueAt: task.dueAt, reason: null }));
}

export const gatherStep: RunStep<DailyPlanState> = {
  key: "gather",
  label: "Gather open tasks",
  onFailure: "abort",
  async run(state, ctx) {
    const tasks = await listOpenTasksForUser(ctx.userId);
    return { state: { ...state, tasks }, source: "none" };
  },
};

export const focusStep: RunStep<DailyPlanState> = {
  key: "focus",
  label: "Pick today's focus",
  onFailure: "continue",
  async run(state) {
    if (state.tasks.length === 0) {
      return { state: { ...state, focused: [] }, source: "none", skipped: true };
    }
    if (!isEnabled("llm")) {
      return {
        state: { ...state, focused: firstN(state.tasks, FOCUS_COUNT) },
        source: "heuristic",
      };
    }
    try {
      const result = await streamArray({
        task: FOCUS_TASK,
        context: [
          `Today's date: ${state.todayIso}`,
          untrusted(formatIndexedList(state.tasks.map((task) => task.title))),
        ],
        element: focusElementSchema,
        maxCostCents: FOCUS_MAX_COST_CENTS,
        maxOutputTokens: FOCUS_MAX_OUTPUT_TOKENS,
        promptId: "daily-plan-focus",
      });

      const focused: FocusedTask[] = [];
      for (const element of result.output) {
        // Model indices are untrusted (same guard as the capture pipeline) — an
        // out-of-range or duplicate index is dropped rather than mis-applied.
        const task = state.tasks[element.index];
        if (!task) continue;
        if (focused.some((existing) => existing.id === task.id)) continue;
        focused.push({ id: task.id, title: task.title, dueAt: task.dueAt, reason: element.reason });
        if (focused.length >= FOCUS_COUNT) break;
      }

      // A short/truncated streamArray result (M4) that happened to yield zero VALID
      // entries still degrades to the heuristic ordering rather than emailing an empty
      // plan — this is a "the call technically succeeded but told us nothing usable"
      // case, same intent as the throw-fallback below.
      if (focused.length === 0) {
        return {
          state: { ...state, focused: firstN(state.tasks, FOCUS_COUNT) },
          source: "heuristic",
        };
      }

      return {
        state: { ...state, focused },
        source: "llm",
        model: result.model,
        inputTokens: result.usage.inputTokens,
        outputTokens: result.usage.outputTokens,
        costCents: result.costCents,
      };
    } catch (error) {
      captureException(error, { stage: "daily-plan-focus" });
      return {
        state: { ...state, focused: firstN(state.tasks, FOCUS_COUNT) },
        source: "heuristic",
      };
    }
  },
};

export const notifyStep: RunStep<DailyPlanState> = {
  key: "notify",
  label: "Send the daily plan email",
  onFailure: "continue",
  async run(state, ctx) {
    if (!isEnabled("email")) {
      return { state, source: "none", skipped: true };
    }
    const email = await getUserEmail(ctx.userId);
    if (!email) {
      return { state, source: "none", skipped: true };
    }
    const result = await send("daily-plan", email, {
      tasks: state.focused.map((task) => ({
        title: task.title,
        dueAt: task.dueAt,
        reason: task.reason,
      })),
      appUrl: getAppUrl(),
    });
    // Fire-and-log (same contract as the retired `checkMonitor`'s change-digest send):
    // a failed/undelivered send must not fail the run. The 'console' transport never
    // claims delivery by design — only warn on the other "should have but didn't" reasons.
    if (!result.delivered && result.reason !== "console") {
      console.warn("[@factory/jobs] daily-plan email not delivered:", result.reason);
    }
    return { state, source: "none", skipped: false };
  },
};

export const dailyPlanPipeline: ReadonlyArray<RunStep<DailyPlanState>> = [
  gatherStep,
  focusStep,
  notifyStep,
];
