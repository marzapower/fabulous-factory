/**
 * `runReducer` — the single source of truth for the live workspace view
 * (m11-untangle-workspace.md K.8.4). Pure, no DOM, no I/O: it folds the `RunEvent`
 * stream `POST /api/runs` writes (engine events plus the tasks domain's `TaskEvent`
 * riding inside `{ type: "data" }`) into a `WorkspaceState` a component can render
 * directly. Unit-tested (`apps/web/test/run-reducer.test.ts`) against duplicate and
 * out-of-order deliveries — a real risk here since the SSE frame parser (`@/lib/sse`)
 * hands frames to this reducer one at a time over an ordinary chunked HTTP body, and a
 * proxy or a retried fetch could in principle re-deliver or reorder them.
 *
 * Convergence rules, stated once here rather than scattered through the switch below:
 * - `run-started` for a DIFFERENT `runId` than the one in state resets everything (a
 *   fresh run starting); for the SAME `runId` it's a no-op (idempotent).
 * - A `step` event only moves a step FORWARD. Each step key tracks its own `attempt`;
 *   a `step` event with an older attempt than what's already recorded is dropped
 *   (stale duplicate/reorder). Within the SAME attempt, status can only move forward
 *   along `queued < running < terminal` — a `running` arriving after a `succeeded` for
 *   the same attempt is dropped, not applied backwards. A NEWER attempt always wins
 *   and starts that step fresh (a durable-driver retry).
 * - `task-added` is idempotent on `id` — a duplicate delivery is dropped after the
 *   first.
 * - `task-triaged` / `task-decomposed` may legitimately arrive before the `task-added`
 *   they refer to (the transport guarantees order, but nothing here assumes it) — both
 *   are staged in a pending bucket keyed by task id and flushed the moment the task
 *   appears, so no ordering between "added" and "triaged"/"decomposed" is assumed.
 * - `run-finished` is terminal and idempotent — applying it twice (or out of order
 *   after a later duplicate `step`) always yields the same `runStatus`/`totalCostCents`.
 */
import type { RunEvent, TaskEvent } from "@factory/untangle";

export type WorkspaceStepStatus = "queued" | "running" | "succeeded" | "failed" | "skipped";

export interface WorkspaceStep {
  key: string;
  label: string;
  ordinal: number;
  status: WorkspaceStepStatus;
  attempt: number;
  source?: "llm" | "heuristic" | "none";
  model?: string | null;
  costCents?: number | null;
  durationMs?: number | null;
}

export interface WorkspaceTriage {
  priority: "now" | "next" | "later";
  effortMinutes: number | null;
  dueAt: string | null;
  tag: string | null;
}

export interface WorkspaceTask {
  id: string;
  index: number;
  title: string;
  sourceStart: number | null;
  sourceEnd: number | null;
  priority: WorkspaceTriage["priority"] | null;
  effortMinutes: number | null;
  dueAt: string | null;
  tag: string | null;
  parentId: string | null;
  children: string[];
  /** Arrival sequence across the whole run, root tasks and subtasks alike — used to
   * order the entering-card animation by network arrival, never a faked stagger. */
  arrivalOrder: number;
}

export type WorkspaceRunStatus = "idle" | "running" | "succeeded" | "partial" | "failed";

export interface WorkspaceState {
  runId: string | null;
  runStatus: WorkspaceRunStatus;
  steps: WorkspaceStep[];
  taskOrder: string[];
  tasks: Record<string, WorkspaceTask>;
  totalCostCents: number | null;
  error: string | null;
  /** Staged `task-triaged`/`task-decomposed` payloads keyed by the task id they target,
   * for events that arrive before their `task-added`. Flushed into `tasks` the moment
   * that id appears; never rendered directly. */
  pendingTriage: Record<string, WorkspaceTriage>;
  pendingChildren: Record<string, Array<{ id: string; title: string }>>;
  nextArrivalOrder: number;
}

export const initialWorkspaceState: WorkspaceState = {
  runId: null,
  runStatus: "idle",
  steps: [],
  taskOrder: [],
  tasks: {},
  totalCostCents: null,
  error: null,
  pendingTriage: {},
  pendingChildren: {},
  nextArrivalOrder: 0,
};

const STATUS_RANK: Record<WorkspaceStepStatus, number> = {
  queued: 0,
  running: 1,
  succeeded: 2,
  failed: 2,
  skipped: 2,
};

function applyStep(
  state: WorkspaceState,
  event: Extract<RunEvent, { type: "step" }>,
): WorkspaceState {
  const existing = state.steps.find((step) => step.key === event.key);
  const incomingStatus = event.status as WorkspaceStepStatus;

  if (existing) {
    if (event.attempt < existing.attempt) {
      // Stale attempt, dropped.
      return state;
    }
    if (
      event.attempt === existing.attempt &&
      STATUS_RANK[incomingStatus] < STATUS_RANK[existing.status]
    ) {
      // Same attempt, moving status backwards — dropped.
      return state;
    }
  }

  const updated: WorkspaceStep = {
    key: event.key,
    label: event.label,
    ordinal: event.ordinal,
    status: incomingStatus,
    attempt: event.attempt,
    source: event.source,
    model: event.model ?? null,
    costCents: event.costCents ?? null,
    durationMs: event.durationMs ?? null,
  };

  const steps = existing
    ? state.steps.map((step) => (step.key === event.key ? updated : step))
    : [...state.steps, updated].sort((a, b) => a.ordinal - b.ordinal);

  return { ...state, steps };
}

function flushPending(state: WorkspaceState, task: WorkspaceTask): WorkspaceTask {
  let next = task;
  const triage = state.pendingTriage[task.id];
  if (triage) {
    next = { ...next, ...triage };
  }
  const children = state.pendingChildren[task.id];
  if (children) {
    const existingChildren = new Set(next.children);
    next = {
      ...next,
      children: [
        ...next.children,
        ...children.map((c) => c.id).filter((id) => !existingChildren.has(id)),
      ],
    };
  }
  return next;
}

function applyTaskAdded(
  state: WorkspaceState,
  event: Extract<TaskEvent, { kind: "task-added" }>,
): WorkspaceState {
  if (state.tasks[event.id]) {
    // Duplicate delivery — dropped.
    return state;
  }

  const base: WorkspaceTask = {
    id: event.id,
    index: event.index,
    title: event.title,
    sourceStart: event.sourceStart,
    sourceEnd: event.sourceEnd,
    priority: null,
    effortMinutes: null,
    dueAt: null,
    tag: null,
    parentId: null,
    children: [],
    arrivalOrder: state.nextArrivalOrder,
  };
  const task = flushPending(state, base);

  const restTriage = { ...state.pendingTriage };
  delete restTriage[event.id];
  const restChildren = { ...state.pendingChildren };
  delete restChildren[event.id];

  return {
    ...state,
    tasks: { ...state.tasks, [event.id]: task },
    taskOrder: [...state.taskOrder, event.id],
    pendingTriage: restTriage,
    pendingChildren: restChildren,
    nextArrivalOrder: state.nextArrivalOrder + 1,
  };
}

function applyTaskTriaged(
  state: WorkspaceState,
  event: Extract<TaskEvent, { kind: "task-triaged" }>,
): WorkspaceState {
  const triage: WorkspaceTriage = {
    priority: event.priority,
    effortMinutes: event.effortMinutes,
    dueAt: event.dueAt,
    tag: event.tag,
  };

  const existing = state.tasks[event.id];
  if (!existing) {
    // Arrived ahead of `task-added` — stage it; also idempotent against a duplicate
    // stage of the same triage (last write wins while pending, which is fine, both
    // carry the same final answer for a given id).
    return { ...state, pendingTriage: { ...state.pendingTriage, [event.id]: triage } };
  }

  return {
    ...state,
    tasks: { ...state.tasks, [event.id]: { ...existing, ...triage } },
  };
}

function applyTaskDecomposed(
  state: WorkspaceState,
  event: Extract<TaskEvent, { kind: "task-decomposed" }>,
): WorkspaceState {
  let nextState = state;
  const childIds: string[] = [];

  for (const child of event.subtasks) {
    childIds.push(child.id);
    if (nextState.tasks[child.id]) {
      continue; // Duplicate delivery of the same subtask — dropped.
    }
    const childTask: WorkspaceTask = {
      id: child.id,
      index: -1,
      title: child.title,
      sourceStart: null,
      sourceEnd: null,
      priority: null,
      effortMinutes: null,
      dueAt: null,
      tag: null,
      parentId: event.parentId,
      children: [],
      arrivalOrder: nextState.nextArrivalOrder,
    };
    nextState = {
      ...nextState,
      tasks: { ...nextState.tasks, [child.id]: childTask },
      nextArrivalOrder: nextState.nextArrivalOrder + 1,
    };
  }

  const parent = nextState.tasks[event.parentId];
  if (!parent) {
    const existingPending = nextState.pendingChildren[event.parentId] ?? [];
    const existingIds = new Set(existingPending.map((c) => c.id));
    return {
      ...nextState,
      pendingChildren: {
        ...nextState.pendingChildren,
        [event.parentId]: [
          ...existingPending,
          ...event.subtasks.filter((c) => !existingIds.has(c.id)),
        ],
      },
    };
  }

  const existingChildren = new Set(parent.children);
  const newChildIds = childIds.filter((id) => !existingChildren.has(id));
  if (newChildIds.length === 0) {
    return nextState;
  }
  return {
    ...nextState,
    tasks: {
      ...nextState.tasks,
      [event.parentId]: { ...parent, children: [...parent.children, ...newChildIds] },
    },
  };
}

export function runReducer(state: WorkspaceState, event: RunEvent): WorkspaceState {
  switch (event.type) {
    case "run-started": {
      if (state.runId === event.runId) {
        // Idempotent — a duplicate `run-started` for the run already in progress.
        return state.runStatus === "running" ? state : { ...state, runStatus: "running" };
      }
      return { ...initialWorkspaceState, runId: event.runId, runStatus: "running" };
    }
    case "step":
      return applyStep(state, event);
    case "data": {
      const payload = event.payload as TaskEvent;
      switch (payload.kind) {
        case "task-added":
          return applyTaskAdded(state, payload);
        case "task-triaged":
          return applyTaskTriaged(state, payload);
        case "task-decomposed":
          return applyTaskDecomposed(state, payload);
        case "tasks-reset":
          // The extract step emitted cards, then failed part-way and fell back to the
          // heuristic extractor, which re-extracts under fresh ids. Drop everything it
          // told us about — none of those rows were ever written — while keeping the run
          // and its step timeline intact, since the run itself is still going.
          return { ...state, tasks: {}, taskOrder: [] };
        default:
          return state;
      }
    }
    case "run-finished": {
      if (state.runId !== null && state.runId !== event.runId) {
        // An event for a run that isn't the current one — dropped rather than
        // clobbering the run actually in view.
        return state;
      }
      return {
        ...state,
        runId: event.runId,
        runStatus: event.status,
        totalCostCents: event.totalCostCents,
      };
    }
    default:
      return state;
  }
}
