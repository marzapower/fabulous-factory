/**
 * `capturePipeline` — the tasks domain's three-step pipeline (plan K.5.2, corrected by
 * K.14 M4/M5/R1). It runs under `runPipeline` (`../runs/engine`), always via the inline
 * driver for the interactive `POST /api/runs` route (K.1.6/T8).
 *
 * Every step checks `isEnabled("llm")` first and takes the heuristic branch when it's
 * `false`; when it's `true` and the call throws, it falls back to the heuristic
 * (`extract`/`triage`) or reports `skipped: true` (`decompose`) rather than failing the
 * run. The stance is inherited from the page-monitor demo this milestone retired: a
 * degraded result beats a failed one, and the caller must never be able to tell which
 * path ran from the shape of what comes back — only from `source`. `captureException`
 * fires on every fallback so the degradation is visible, never silent.
 *
 * Design note on `streamArray`'s `onElement` — the split that makes live streaming safe:
 * `onElement`'s signature is `(element, index) => void` and `streamArray` does NOT await
 * it, so kicking off a DB insert inside it would race the step's own return (an insert
 * still in flight when `streamArray` resolves and the pipeline moves on). So the work is
 * split by whether it can block:
 *
 *   - `onElement` does ONLY synchronous work — mint an id, locate the source anchor,
 *     `ctx.emit` the `task-added` event. That is what makes a card appear the moment the
 *     model produces it, which is the entire point of streaming here (K.9): a run that
 *     reveals nothing until it finishes is just a spinner with extra steps.
 *   - Persistence happens AFTER `streamArray` resolves, in arrival order, under the ids
 *     already emitted — fully awaited, no race, and the UI never has to reconcile a
 *     temporary key against a real one.
 *
 * The accepted trade: a card is on screen a beat before its row exists. If the process
 * dies in between, the user saw a task that was never persisted and a refresh won't show
 * it — which is the honest outcome for a run that did not finish, and strictly better
 * than showing nothing at all for the several seconds a real extraction takes.
 */
import { randomUUID } from "node:crypto";

import { isEnabled } from "@factory/config";
import { untrusted } from "@factory/core";
import { streamArray } from "@factory/llm";
import { captureException } from "@factory/observability";

import type { RunStep, RunStepContext, RunStepResult } from "../runs/engine";
import { MAX_SUBTASKS_PER_TASK, MAX_TASKS_PER_RUN, type Priority } from "./constants";
import { heuristicExtract, heuristicTriage, locateQuote } from "./heuristics";
import {
  DECOMPOSE_TASK,
  decomposeElementSchema,
  EXTRACT_TASK,
  extractElementSchema,
  formatIndexedList,
  TRIAGE_TASK,
  triageElementSchema,
} from "./prompts";
import { applyTriage, insertExtractedTask, insertSubtasks } from "./queries";

export interface CaptureState {
  captureId: string;
  rawText: string;
  /** Trusted context, injected by the caller (K.1.8: an ISO string, never a `Date`). */
  todayIso: string;
  tasks: Array<{ id: string; index: number; title: string; needsBreakdown: boolean }>;
}

export type TaskEvent =
  | {
      kind: "task-added";
      id: string;
      index: number;
      title: string;
      sourceStart: number | null;
      sourceEnd: number | null;
    }
  | {
      kind: "task-triaged";
      id: string;
      index: number;
      priority: Priority;
      effortMinutes: number | null;
      dueAt: string | null;
      tag: string | null;
    }
  | {
      kind: "task-decomposed";
      parentId: string;
      parentIndex: number;
      subtasks: Array<{ id: string; title: string }>;
    }
  /**
   * "Forget every task I told you about." Emitted only when the LLM extract step throws
   * PART-WAY THROUGH a stream it had already emitted `task-added` events for, immediately
   * before the heuristic fallback re-extracts from scratch under fresh ids.
   *
   * Without it the browser keeps the cards it was told about — none of which were ever
   * persisted, since extract emits live but writes only after the stream resolves — and
   * then adds the heuristic's cards on top: a screen showing N + M tasks where the
   * database holds M. Rows are not duplicated on THIS path — but only because persistence
   * sits outside the fallback's try; see `extractStep`'s persist loop for why a failed
   * insert must fail the run rather than fall back.
   */
  | { kind: "tasks-reset" };

// M5 (binding): a streaming step's `maxCostCents` MUST always be paired with an explicit
// `maxOutputTokens` — omitting it silently enforces a 1024-token cap
// (`packages/llm/src/call.ts`'s `prepareCall`), which would truncate a
// `MAX_TASKS_PER_RUN`-element extraction. Values pinned by K.14 M5.
const EXTRACT_MAX_OUTPUT_TOKENS = 2048;
const TRIAGE_MAX_OUTPUT_TOKENS = 2048;
const DECOMPOSE_MAX_OUTPUT_TOKENS = 1536;

// `maxCostCents` values are NOT pinned by the plan — chosen autonomously here, modest per
// call in the same spirit as `checkMonitor`'s `maxCostCents: 5` for its much shorter
// single-summary call.
const EXTRACT_MAX_COST_CENTS = 20;
const TRIAGE_MAX_COST_CENTS = 15;
const DECOMPOSE_MAX_COST_CENTS = 10;

async function runHeuristicExtract(
  state: CaptureState,
  ctx: RunStepContext,
): Promise<RunStepResult<CaptureState>> {
  const found = heuristicExtract(state.rawText);
  const tasks: CaptureState["tasks"] = [];
  for (const item of found) {
    const inserted = await insertExtractedTask({
      userId: ctx.userId,
      runId: ctx.runId,
      captureId: state.captureId,
      title: item.title,
      source: "heuristic",
      sourceStart: item.sourceStart,
      sourceEnd: item.sourceEnd,
    });
    const index = tasks.length;
    tasks.push({ id: inserted.id, index, title: item.title, needsBreakdown: false });
    ctx.emit({
      type: "data",
      payload: {
        kind: "task-added",
        id: inserted.id,
        index,
        title: item.title,
        sourceStart: item.sourceStart,
        sourceEnd: item.sourceEnd,
      } satisfies TaskEvent,
    });
  }
  return { state: { ...state, tasks }, source: "heuristic" };
}

export const extractStep: RunStep<CaptureState> = {
  key: "extract",
  label: "Extract tasks",
  onFailure: "abort",
  async run(state, ctx) {
    if (!isEnabled("llm")) {
      return runHeuristicExtract(state, ctx);
    }
    // Filled synchronously from `onElement` as elements arrive; persisted after the
    // stream resolves. Declared outside the try so the persist loop below can reach it.
    const streamed: Array<{
      id: string;
      title: string;
      sourceStart: number | null;
      sourceEnd: number | null;
    }> = [];
    let llmResult: Awaited<ReturnType<typeof streamArray<typeof extractElementSchema>>>;

    try {
      const result = await streamArray({
        task: EXTRACT_TASK,
        context: [`Today's date: ${state.todayIso}`, untrusted(state.rawText)],
        element: extractElementSchema,
        maxCostCents: EXTRACT_MAX_COST_CENTS,
        maxOutputTokens: EXTRACT_MAX_OUTPUT_TOKENS,
        promptId: "tasks-extract",
        // SYNCHRONOUS ONLY — see the file header. No awaits, no DB, nothing that can
        // still be in flight when `streamArray` resolves.
        onElement: (element) => {
          if (streamed.length >= MAX_TASKS_PER_RUN) return;
          const title = element.title.trim();
          if (!title) return;
          // A hallucinated quote must yield no anchor (`locateQuote` returns null), never
          // a wrong one — never guess an offset for a quote that doesn't actually appear.
          const anchor = element.sourceQuote
            ? locateQuote(state.rawText, element.sourceQuote)
            : null;
          const index = streamed.length;
          const id = randomUUID();
          streamed.push({
            id,
            title,
            sourceStart: anchor?.start ?? null,
            sourceEnd: anchor?.end ?? null,
          });
          ctx.emit({
            type: "data",
            payload: {
              kind: "task-added",
              id,
              index,
              title,
              sourceStart: anchor?.start ?? null,
              sourceEnd: anchor?.end ?? null,
            } satisfies TaskEvent,
          });
        },
      });

      llmResult = result;
    } catch (error) {
      // The LLM call failed — never fails the run (K.5.2), fall back to the heuristic
      // extractor. No ROW was written above: only `streamArray` is inside this try, and
      // persistence happens below it, deliberately. But `onElement` may already have
      // EMITTED cards for elements that arrived before the throw, and those ids will
      // never exist — tell the client to drop them before the heuristic re-extracts under
      // fresh ids, or the view shows phantom tasks the database has no record of.
      captureException(error, { stage: "tasks-extract" });
      ctx.emit({ type: "data", payload: { kind: "tasks-reset" } satisfies TaskEvent });
      return runHeuristicExtract(state, ctx);
    }

    // Persist OUTSIDE the try, under the ids already emitted, in arrival order, fully
    // awaited. Deliberately not covered by the fallback above: if an insert fails partway,
    // some LLM rows are already committed, and re-running the heuristic extractor on top
    // would write a SECOND full set for the same capture. A database failure is not a
    // degraded-LLM situation — it propagates, and `onFailure: "abort"` fails the run
    // honestly instead of quietly doubling the user's task list.
    const tasks: CaptureState["tasks"] = [];
    for (const [index, item] of streamed.entries()) {
      await insertExtractedTask({
        id: item.id,
        userId: ctx.userId,
        runId: ctx.runId,
        captureId: state.captureId,
        title: item.title,
        source: "llm",
        sourceStart: item.sourceStart,
        sourceEnd: item.sourceEnd,
      });
      tasks.push({ id: item.id, index, title: item.title, needsBreakdown: false });
    }

    return {
      state: { ...state, tasks },
      source: "llm",
      model: llmResult.model,
      inputTokens: llmResult.usage.inputTokens,
      outputTokens: llmResult.usage.outputTokens,
      costCents: llmResult.costCents,
    };
  },
};

async function runHeuristicTriage(
  state: CaptureState,
  ctx: RunStepContext,
): Promise<RunStepResult<CaptureState>> {
  const titles = state.tasks.map((task) => task.title);
  const triaged = heuristicTriage(titles, state.todayIso);
  const tasks = [...state.tasks];
  for (const entry of triaged) {
    const task = tasks[entry.index];
    if (!task) continue;
    await applyTriage(task.id, ctx.userId, {
      priority: entry.priority,
      effortMinutes: entry.effortMinutes,
      dueAt: entry.dueAt ? new Date(entry.dueAt) : null,
      tag: entry.tag,
    });
    ctx.emit({
      type: "data",
      payload: {
        kind: "task-triaged",
        id: task.id,
        index: task.index,
        priority: entry.priority,
        effortMinutes: entry.effortMinutes,
        dueAt: entry.dueAt,
        tag: entry.tag,
      } satisfies TaskEvent,
    });
  }
  return { state: { ...state, tasks }, source: "heuristic" };
}

export const triageStep: RunStep<CaptureState> = {
  key: "triage",
  label: "Triage tasks",
  onFailure: "continue",
  async run(state, ctx) {
    if (state.tasks.length === 0) {
      return { state, source: "none", skipped: true };
    }
    if (!isEnabled("llm")) {
      return runHeuristicTriage(state, ctx);
    }
    try {
      const result = await streamArray({
        task: TRIAGE_TASK,
        context: [
          `Today's date: ${state.todayIso}`,
          untrusted(formatIndexedList(state.tasks.map((task) => task.title))),
        ],
        element: triageElementSchema,
        maxCostCents: TRIAGE_MAX_COST_CENTS,
        maxOutputTokens: TRIAGE_MAX_OUTPUT_TOKENS,
        promptId: "tasks-triage",
      });

      const tasks = [...state.tasks];
      for (const element of result.output) {
        // Model indices are untrusted (K.14 binding detail): `tasks[element.index]` is
        // `undefined` for any out-of-range (or negative, or non-integer) index — dropped
        // here rather than mis-applied to the wrong task. `tasks-pipeline.test.ts`
        // exercises this directly.
        const task = tasks[element.index];
        if (!task) continue;

        await applyTriage(task.id, ctx.userId, {
          priority: element.priority,
          effortMinutes: element.effortMinutes,
          dueAt: element.dueAt ? new Date(element.dueAt) : null,
          tag: element.tag,
        });
        tasks[element.index] = { ...task, needsBreakdown: element.needsBreakdown };
        ctx.emit({
          type: "data",
          payload: {
            kind: "task-triaged",
            id: task.id,
            index: task.index,
            priority: element.priority,
            effortMinutes: element.effortMinutes,
            dueAt: element.dueAt,
            tag: element.tag,
          } satisfies TaskEvent,
        });
      }

      return {
        state: { ...state, tasks },
        source: "llm",
        model: result.model,
        inputTokens: result.usage.inputTokens,
        outputTokens: result.usage.outputTokens,
        costCents: result.costCents,
      };
    } catch (error) {
      captureException(error, { stage: "tasks-triage" });
      return runHeuristicTriage(state, ctx);
    }
  },
};

export const decomposeStep: RunStep<CaptureState> = {
  key: "decompose",
  label: "Break down complex tasks",
  onFailure: "continue",
  async run(state, ctx) {
    const candidates = state.tasks.filter((task) => task.needsBreakdown);
    if (!isEnabled("llm") || candidates.length === 0) {
      // No-LLM path (or nothing to do) never fakes subtasks (K.5.2) — just skipped.
      return { state, source: "none", skipped: true };
    }
    try {
      const result = await streamArray({
        task: DECOMPOSE_TASK,
        context: [untrusted(formatIndexedList(candidates.map((task) => task.title)))],
        element: decomposeElementSchema,
        maxCostCents: DECOMPOSE_MAX_COST_CENTS,
        maxOutputTokens: DECOMPOSE_MAX_OUTPUT_TOKENS,
        promptId: "tasks-decompose",
      });

      for (const element of result.output) {
        // Same untrusted-index guard as triage, against the CANDIDATES array (the list
        // this call's context was actually built from), not the full task list.
        const parent = candidates[element.index];
        if (!parent) continue;

        const titles = element.subtasks
          .map((title) => title.trim())
          .filter((title) => title.length > 0)
          .slice(0, MAX_SUBTASKS_PER_TASK);
        if (titles.length === 0) continue;

        const inserted = await insertSubtasks(parent.id, ctx.userId, ctx.runId, titles, "llm");
        ctx.emit({
          type: "data",
          payload: {
            kind: "task-decomposed",
            parentId: parent.id,
            parentIndex: parent.index,
            subtasks: inserted,
          } satisfies TaskEvent,
        });
      }

      return {
        state,
        source: "llm",
        model: result.model,
        inputTokens: result.usage.inputTokens,
        outputTokens: result.usage.outputTokens,
        costCents: result.costCents,
      };
    } catch (error) {
      // Never faked (K.5.2) — a decompose failure just reports skipped; there is no
      // heuristic stand-in for "invent subtasks".
      captureException(error, { stage: "tasks-decompose" });
      return { state, source: "none", skipped: true };
    }
  },
};

export const capturePipeline: ReadonlyArray<RunStep<CaptureState>> = [
  extractStep,
  triageStep,
  decomposeStep,
];
