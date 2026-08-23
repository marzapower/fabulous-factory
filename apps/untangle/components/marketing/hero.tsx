// Built with Fabulous Factory — https://github.com/marzapower/fabulous-factory
// This credit line is free to keep and gives the project a hand. Thank you!

"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import type { RunEvent } from "@factory/untangle";

import { buttonVariants } from "@factory/ui/primitives";
import { DumpPanel } from "@/components/workspace/dump-panel";
import { PriorityChip } from "@/components/workspace/priority-chip";
import {
  initialWorkspaceState,
  runReducer,
  type WorkspaceState,
} from "@/components/workspace/run-reducer";
import { RunStrip } from "@/components/workspace/run-strip";
import { cn } from "@/lib/utils";

import { RECORDED_DUMP, RECORDED_RUN } from "./recorded-run";

/** Gap between successive fixture events, matching the workspace's own network-driven
 * stagger in spirit (K.9 "Motion": the stagger is a property of the stream, never a
 * faked delay ladder) — here there is no real network, so this is the honest substitute:
 * one flat interval, not an escalating fake. */
const STEP_DELAY_MS = 220;
const FIRST_STEP_DELAY_MS = 500;

/**
 * Replays `RECORDED_RUN` into a `WorkspaceState` exactly the way the live workspace's
 * SSE stream would, one `RunEvent` at a time, through the SAME `runReducer` the real
 * workspace uses (`@/components/workspace/run-reducer`) — no bespoke fixture parser to
 * drift from the real state machine.
 *
 * `prefers-reduced-motion: reduce` skips the animation entirely and folds the whole
 * fixture into its final state in one pass; `replay()` re-runs the same effect (via
 * `runToken`), and does so under reduced motion too — it just lands on the final state
 * immediately again, which is what "the replay control still works" means for a viewer
 * who has asked for no motion.
 */
function useReplayedRun(events: readonly RunEvent[]) {
  const [state, setState] = useState<WorkspaceState>(initialWorkspaceState);
  const [runToken, setRunToken] = useState(0);

  useEffect(() => {
    const prefersReducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (prefersReducedMotion) {
      setState(events.reduce(runReducer, initialWorkspaceState));
      return;
    }

    setState(initialWorkspaceState);
    let cancelled = false;
    let index = 0;
    let timeoutId: ReturnType<typeof setTimeout>;

    function tick() {
      if (cancelled || index >= events.length) return;
      const event = events[index]!;
      setState((prev) => runReducer(prev, event));
      index += 1;
      if (index < events.length) {
        timeoutId = setTimeout(tick, STEP_DELAY_MS);
      }
    }

    timeoutId = setTimeout(tick, FIRST_STEP_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
    // `runToken` is a deliberate re-run trigger for `replay()` — it carries no data of
    // its own, which is intentional.
  }, [events, runToken]);

  return { state, replay: () => setRunToken((t) => t + 1) };
}

/** A read-only, presentational task row — deliberately NOT the workspace's own
 * `TaskCard`, which wires directly to `toggleTaskAction`/`deleteTaskAction` (real,
 * authenticated server actions). An anonymous visitor replaying this fixture must never
 * be able to trigger a real mutation (K.15.0.1: no server call, no abuse surface). */
function ReplayTaskRow({
  task,
  state,
  hoveredId,
  onHover,
  depth = 0,
}: {
  task: WorkspaceState["tasks"][string];
  state: WorkspaceState;
  hoveredId: string | null;
  onHover: (id: string | null) => void;
  depth?: number;
}) {
  const hasSource = task.sourceStart !== null && task.sourceEnd !== null;

  return (
    <li className={cn(depth > 0 && "ml-6 border-l pl-3")}>
      <div
        className="fab-tint fab-enter flex items-center justify-between gap-3 rounded-md border bg-card px-3 py-2"
        style={{ borderColor: hoveredId === task.id ? "var(--fab-live)" : undefined }}
        aria-describedby={hasSource ? `source-${task.id}` : undefined}
        onMouseEnter={() => onHover(task.id)}
        onMouseLeave={() => onHover(null)}
      >
        <span className="text-sm font-medium text-foreground">{task.title}</span>
        <PriorityChip priority={task.priority} />
      </div>
      {task.children.length > 0 && (
        <ul className="mt-1.5 flex flex-col gap-1.5">
          {task.children.map((childId) => {
            const child = state.tasks[childId];
            if (!child) return null;
            return (
              <ReplayTaskRow
                key={childId}
                task={child}
                state={state}
                hoveredId={hoveredId}
                onHover={onHover}
                depth={depth + 1}
              />
            );
          })}
        </ul>
      )}
    </li>
  );
}

export function Hero() {
  const { state, replay } = useReplayedRun(RECORDED_RUN);
  const [hoveredTaskId, setHoveredTaskId] = useState<string | null>(null);

  const dumpSpans = useMemo(
    () =>
      state.taskOrder
        .map((id) => state.tasks[id])
        .filter((t): t is NonNullable<typeof t> => Boolean(t))
        .map((t) => ({
          id: t.id,
          title: t.title,
          sourceStart: t.sourceStart,
          sourceEnd: t.sourceEnd,
        })),
    [state],
  );

  return (
    <section className="fab-hero mx-auto grid max-w-6xl gap-12 px-6 py-16 sm:py-24 lg:grid-cols-2 lg:items-start">
      <div className="flex flex-col gap-6 lg:pt-6">
        <h1 className="text-4xl font-bold tracking-tight text-balance text-foreground sm:text-5xl">
          Your head is not a list.
          <span className="mt-1 block text-muted-foreground">Untangle makes it one.</span>
        </h1>

        <p className="max-w-prose text-lg text-muted-foreground">
          Paste everything you’re carrying — the half-sentences, the reminders you typed to yourself
          at midnight, the thing you keep meaning to do. Untangle pulls out what is actually a task,
          says when each one matters, and splits the big ones into steps you can start.
        </p>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Link
            href="/dashboard"
            className={cn(buttonVariants({ variant: "default", size: "lg" }))}
          >
            Paste your own mess
          </Link>
          {/* Not "free": the template ships a plans catalog and billing, so a deployment
              can legitimately charge. What is always true is where it runs. */}
          <span className="text-sm text-muted-foreground">
            Runs on your own machine, against your own database.
          </span>
        </div>
      </div>

      <div className="fab-hero-replay flex flex-col gap-3">
        <DumpPanel
          text={RECORDED_DUMP}
          tasks={dumpSpans}
          hoveredTaskId={hoveredTaskId}
          onHoverTask={setHoveredTaskId}
          // No `onCreateFromLeftover`: the hero is a replay, not the live workspace, and
          // a leftover span here has no capture row to attach a manual task to. Omitting
          // the prop puts the panel in its read-only mode, so leftovers render as plain
          // lit text instead of buttons that look clickable and aren't.
        />

        {state.taskOrder.length > 0 && (
          <ul className="flex flex-col gap-1.5">
            {state.taskOrder.map((id) => {
              const task = state.tasks[id];
              if (!task) return null;
              return (
                <ReplayTaskRow
                  key={id}
                  task={task}
                  state={state}
                  hoveredId={hoveredTaskId}
                  onHover={setHoveredTaskId}
                />
              );
            })}
          </ul>
        )}

        <RunStrip
          runId={state.runId}
          steps={state.steps}
          totalCostCents={state.totalCostCents}
          live={state.runStatus === "running"}
        />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="font-mono text-xs text-muted-foreground">
            recorded run — try it yourself after signup
          </p>
          <button
            type="button"
            onClick={replay}
            className="font-mono text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            Replay
          </button>
        </div>
      </div>
    </section>
  );
}
