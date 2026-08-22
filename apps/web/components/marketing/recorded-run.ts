// Built with Fabulous Factory — https://github.com/marzapower/fabulous-factory
// This credit line is free to keep and gives the project a hand. Thank you!

/**
 * The recorded run (m11-untangle-workspace.md K.15.0.1 / N5) — the hero's replay and the
 * degradation strip's comparison both play back this SAME fixture, never a live call: no
 * server round trip, no cost, and it can't break on a deployment with no LLM key.
 *
 * `readonly RunEvent[]`, typed against the real engine (`@factory/jobs`), is the whole
 * point of N5: if `packages/jobs/src/runs/engine.ts`'s event shape ever changes, this
 * file fails to COMPILE instead of quietly replaying a shape the engine no longer
 * produces. The event sequence below mirrors `runPipeline`'s real emission order
 * (`packages/jobs/src/runs/engine.ts`) and `capturePipeline`'s real step keys/labels
 * (`packages/jobs/src/tasks/pipeline.ts`) exactly — three steps, `extract` → `triage` →
 * `decompose` — so nobody can catch this fixture describing a pipeline the repo doesn't
 * actually run.
 *
 * `RunEvent`'s `step` variant carries no token counts (only `model` / `costCents` /
 * `durationMs`) — that's a fact about the real engine, not an oversight here, and it's
 * exactly what the type check enforces: adding a `tokens` field below would not compile.
 */
import type { RunEvent, TaskEvent } from "@factory/jobs";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Computed relative to render time rather than baked as a literal date, so the fixture
 * never visibly "expires" into a past-dated due date as the calendar moves on. */
function daysFromNow(days: number): string {
  return new Date(Date.now() + days * DAY_MS).toISOString();
}

export const RECORDED_RUN_ID = "8f14e45f-ceea-467e-9d19-4b7e2c1a9c31";

/** The pasted dump, verbatim — a real mess, not a tidied placeholder. Every task below
 * is anchored to an exact substring of this text via `locate()`, the same technique
 * `packages/jobs/src/tasks/heuristics.ts`'s `locateQuote` uses for the real pipeline. */
export const RECORDED_DUMP =
  `finally reply to the client about the contract before end of week, they've pinged twice\n` +
  `book the flight for the SF offsite, dates are march 3-6, get it before prices jump\n` +
  `staging deploy keeps timing out around 2am, probably a cron overlap, look into it\n` +
  `the onboarding email reads a bit robotic, worth a copy pass at some point\n` +
  `renew the domain, it lapses in 12 days\n` +
  `grab lunch with dana sometime, she's been asking to catch up\n` +
  `pricing page still says "coming soon" next to annual billing`;

function locate(quote: string): { start: number; end: number } {
  const start = RECORDED_DUMP.indexOf(quote);
  if (start === -1) {
    // A quote that drifted out of sync with RECORDED_DUMP above — fail loudly at import
    // time rather than render a task with no source span.
    throw new Error(`recorded-run fixture: quote not found in RECORDED_DUMP: "${quote}"`);
  }
  return { start, end: start + quote.length };
}

interface RecordedTaskSeed {
  id: string;
  quote: string;
  title: string;
  priority: "now" | "next" | "later";
  effortMinutes: number;
  dueAt: string | null;
  tag: string;
  subtasks?: string[];
}

// Two of the dump's seven lines (the lunch, the pricing-copy nag) never became a task —
// the model left them, which the hero's replay shows honestly rather than pretending
// every line converts (K.9's "consuming dump": lit text is what the model ignored).
const TASK_SEEDS: readonly RecordedTaskSeed[] = [
  {
    id: "rr-1",
    quote: "reply to the client about the contract before end of week",
    title: "Reply to the client about the contract",
    priority: "now",
    effortMinutes: 15,
    dueAt: daysFromNow(2),
    tag: "clients",
  },
  {
    id: "rr-2",
    quote: "book the flight for the SF offsite, dates are march 3-6",
    title: "Book the flight for the SF offsite",
    priority: "next",
    effortMinutes: 20,
    dueAt: daysFromNow(9),
    tag: "travel",
  },
  {
    id: "rr-3",
    quote: "staging deploy keeps timing out around 2am, probably a cron overlap, look into it",
    title: "Investigate the staging deploy timeouts",
    priority: "now",
    effortMinutes: 45,
    dueAt: null,
    tag: "eng",
    subtasks: ["Check the 2am cron overlap window", "Add an alert for deploy timeouts"],
  },
  {
    id: "rr-4",
    quote: "the onboarding email reads a bit robotic, worth a copy pass",
    title: "Rewrite the onboarding email copy",
    priority: "later",
    effortMinutes: 30,
    dueAt: null,
    tag: "content",
  },
  {
    id: "rr-5",
    quote: "renew the domain, it lapses in 12 days",
    title: "Renew the domain",
    priority: "now",
    effortMinutes: 5,
    dueAt: daysFromNow(12),
    tag: "ops",
  },
];

const EXTRACT_MODEL = "openrouter/anthropic/claude-3.5-haiku";
const TRIAGE_MODEL = "openrouter/anthropic/claude-3.5-haiku";
const DECOMPOSE_MODEL = "openrouter/anthropic/claude-3.5-haiku";

const taskAddedEvents: RunEvent[] = TASK_SEEDS.map((seed, index) => {
  const span = locate(seed.quote);
  const payload: Extract<TaskEvent, { kind: "task-added" }> = {
    kind: "task-added",
    id: seed.id,
    index,
    title: seed.title,
    sourceStart: span.start,
    sourceEnd: span.end,
  };
  return { type: "data", payload };
});

const taskTriagedEvents: RunEvent[] = TASK_SEEDS.map((seed, index) => {
  const payload: Extract<TaskEvent, { kind: "task-triaged" }> = {
    kind: "task-triaged",
    id: seed.id,
    index,
    priority: seed.priority,
    effortMinutes: seed.effortMinutes,
    dueAt: seed.dueAt,
    tag: seed.tag,
  };
  return { type: "data", payload };
});

const decomposeParent = TASK_SEEDS.find((seed) => seed.subtasks);
const taskDecomposedEvents: RunEvent[] = decomposeParent
  ? [
      {
        type: "data",
        payload: {
          kind: "task-decomposed",
          parentId: decomposeParent.id,
          parentIndex: TASK_SEEDS.indexOf(decomposeParent),
          subtasks: decomposeParent.subtasks!.map((title, i) => ({
            id: `${decomposeParent.id}-sub-${i}`,
            title,
          })),
        } satisfies Extract<TaskEvent, { kind: "task-decomposed" }>,
      },
    ]
  : [];

/**
 * The recorded run, LLM path — `capturePipeline`'s real three steps, in `runPipeline`'s
 * real emission order (`run-started` → per-step `running` → its `data` events → its
 * terminal `step` → … → `run-finished`). This is the ONE source array: the degradation
 * strip's heuristic side (`deriveHeuristicRun`, below) is computed FROM this array, never
 * authored separately, so the two can't drift apart (K.16 R4).
 */
export const RECORDED_RUN: readonly RunEvent[] = [
  { type: "run-started", runId: RECORDED_RUN_ID },

  {
    type: "step",
    key: "extract",
    label: "Extract tasks",
    ordinal: 0,
    status: "running",
    attempt: 1,
  },
  ...taskAddedEvents,
  {
    type: "step",
    key: "extract",
    label: "Extract tasks",
    ordinal: 0,
    status: "succeeded",
    attempt: 1,
    source: "llm",
    model: EXTRACT_MODEL,
    costCents: 0.18,
    durationMs: 1240,
  },

  { type: "step", key: "triage", label: "Triage tasks", ordinal: 1, status: "running", attempt: 1 },
  ...taskTriagedEvents,
  {
    type: "step",
    key: "triage",
    label: "Triage tasks",
    ordinal: 1,
    status: "succeeded",
    attempt: 1,
    source: "llm",
    model: TRIAGE_MODEL,
    costCents: 0.09,
    durationMs: 640,
  },

  {
    type: "step",
    key: "decompose",
    label: "Break down complex tasks",
    ordinal: 2,
    status: "running",
    attempt: 1,
  },
  ...taskDecomposedEvents,
  {
    type: "step",
    key: "decompose",
    label: "Break down complex tasks",
    ordinal: 2,
    status: "succeeded",
    attempt: 1,
    source: "llm",
    model: DECOMPOSE_MODEL,
    costCents: 0.05,
    durationMs: 420,
  },

  { type: "run-finished", runId: RECORDED_RUN_ID, status: "succeeded", totalCostCents: 0.32 },
];

/**
 * Derives the heuristic-path replay FROM `RECORDED_RUN` (K.16 R4) — same tasks, same
 * source spans, same step order, so "identical steps" is a structural fact, not a claim
 * that can quietly go stale when one side is edited and the other isn't.
 *
 * What actually changes, matching the real fallback behaviour (`packages/jobs/src/tasks/
 * pipeline.ts`): `extract`/`triage` succeed with `source: "heuristic"` and no
 * model/cost; `decompose` has no heuristic equivalent at all (there's no heuristic
 * stand-in for "invent subtasks") and reports `skipped`, exactly like the real
 * `decomposeStep` does when `isEnabled("llm")` is `false` — so its `task-decomposed`
 * data event is dropped, not relabelled. The run still finishes `succeeded`, with
 * `totalCostCents: null` (nothing billable happened).
 */
export function deriveHeuristicRun(source: readonly RunEvent[]): readonly RunEvent[] {
  const events: RunEvent[] = [];

  for (const event of source) {
    if (event.type === "step" && event.key === "decompose") {
      if (event.status === "succeeded") {
        events.push({ ...event, status: "skipped", source: "none", model: null, costCents: null });
      } else {
        events.push(event);
      }
      continue;
    }

    if (event.type === "data" && (event.payload as TaskEvent).kind === "task-decomposed") {
      // No heuristic decomposition exists — dropped, not relabelled.
      continue;
    }

    if (event.type === "step" && (event.key === "extract" || event.key === "triage")) {
      events.push(
        event.status === "succeeded"
          ? { ...event, source: "heuristic", model: null, costCents: null }
          : event,
      );
      continue;
    }

    if (event.type === "run-finished") {
      events.push({ ...event, totalCostCents: null });
      continue;
    }

    events.push(event);
  }

  return events;
}
