"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

import type { TaskTree } from "@factory/jobs";

import { createManualTaskAction } from "@/app/dashboard/actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { DumpPanel } from "./dump-panel";
import { RunStrip } from "./run-strip";
import { SAMPLE_DUMP } from "./sample";
import { TaskCard } from "./task-card";
import type { DisplayTask } from "./types";
import { useRun } from "./use-run";
import type { WorkspaceState } from "./run-reducer";

function treeToDisplay(
  tree: TaskTree,
  hidden: ReadonlySet<string>,
  statusOverride: ReadonlyMap<string, "open" | "done">,
): DisplayTask | null {
  if (hidden.has(tree.id)) return null;
  const status = tree.status === "done" ? "done" : "open";
  return {
    id: tree.id,
    title: tree.title,
    priority: tree.priority,
    effortMinutes: tree.effortMinutes,
    dueAt: tree.dueAt ? tree.dueAt.toISOString() : null,
    tag: tree.tag,
    status: statusOverride.get(tree.id) ?? status,
    sourceStart: tree.sourceStart,
    sourceEnd: tree.sourceEnd,
    children: tree.children
      .map((child) => treeToDisplay(child, hidden, statusOverride))
      .filter((child): child is DisplayTask => child !== null),
    isLive: false,
  };
}

function liveToDisplay(
  id: string,
  state: WorkspaceState,
  hidden: ReadonlySet<string>,
  statusOverride: ReadonlyMap<string, "open" | "done">,
): DisplayTask | null {
  if (hidden.has(id)) return null;
  const task = state.tasks[id];
  if (!task) return null;
  return {
    id: task.id,
    title: task.title,
    priority: task.priority,
    effortMinutes: task.effortMinutes,
    dueAt: task.dueAt,
    tag: task.tag,
    status: statusOverride.get(id) ?? "open",
    sourceStart: task.sourceStart,
    sourceEnd: task.sourceEnd,
    children: task.children
      .map((childId) => liveToDisplay(childId, state, hidden, statusOverride))
      .filter((child): child is DisplayTask => child !== null),
    isLive: true,
  };
}

export interface WorkspaceProps {
  initialTasks: TaskTree[];
  runsToday: number;
  runsPerDay: number | null;
}

/**
 * The workspace's client half (m11-untangle-workspace.md K.9/K.8.3). Composes the input
 * form, the consuming dump, the task list and the run strip around `useRun`'s stream.
 * Server-persisted tasks (`initialTasks`) and this session's live tasks are rendered
 * through one shared `DisplayTask` shape so `TaskCard` never has to know which source
 * produced a given row; a delete/toggle overlay (`hiddenIds`/`statusOverride`) covers
 * both without a page reload.
 */
export function Workspace({ initialTasks, runsToday, runsPerDay }: WorkspaceProps) {
  const { state, isRunning, error, start } = useRun();
  const [dumpText, setDumpText] = useState("");
  const [submittedText, setSubmittedText] = useState<string | null>(null);
  const [hoveredTaskId, setHoveredTaskId] = useState<string | null>(null);
  const [hiddenIds, setHiddenIds] = useState<ReadonlySet<string>>(new Set());
  const [statusOverride, setStatusOverride] = useState<ReadonlyMap<string, "open" | "done">>(
    new Map(),
  );
  const [creatingSpan, setCreatingSpan] = useState<{ start: number; end: number } | null>(null);
  const [leftoverError, setLeftoverError] = useState<string | null>(null);

  const isEmpty = state.runId === null && initialTasks.length === 0;
  const atCeiling = runsPerDay !== null && runsToday >= runsPerDay;

  const liveIds = useMemo(() => new Set(state.taskOrder), [state.taskOrder]);
  const liveTasks = useMemo(
    () =>
      state.taskOrder
        .map((id) => liveToDisplay(id, state, hiddenIds, statusOverride))
        .filter((t): t is DisplayTask => t !== null),
    [state, hiddenIds, statusOverride],
  );
  const persistedTasks = useMemo(
    () =>
      initialTasks
        .filter((task) => !liveIds.has(task.id))
        .map((task) => treeToDisplay(task, hiddenIds, statusOverride))
        .filter((t): t is DisplayTask => t !== null),
    [initialTasks, liveIds, hiddenIds, statusOverride],
  );
  const displayTasks = [...liveTasks, ...persistedTasks];

  const dumpSpans = useMemo(
    () =>
      Object.values(state.tasks)
        .filter((t) => t.parentId === null)
        .map((t) => ({
          id: t.id,
          title: t.title,
          sourceStart: t.sourceStart,
          sourceEnd: t.sourceEnd,
        })),
    [state.tasks],
  );

  async function handleSubmit() {
    const trimmed = dumpText.trim();
    if (!trimmed || isRunning) return;
    setSubmittedText(trimmed);
    setHiddenIds(new Set());
    setStatusOverride(new Map());
    await start({ text: trimmed });
  }

  async function handleCreateFromLeftover(span: { start: number; end: number; text: string }) {
    const title = span.text.trim();
    if (!title) return;
    setCreatingSpan({ start: span.start, end: span.end });
    setLeftoverError(null);
    const outcome = await createManualTaskAction({
      title,
      sourceStart: span.start,
      sourceEnd: span.end,
    });
    setCreatingSpan(null);
    if (!outcome.ok) {
      setLeftoverError(outcome.error.message);
    }
    // The new manual task isn't wired into `runReducer` (it never arrived over the SSE
    // stream) — it will show up in `initialTasks` on next load. Kept intentionally
    // simple: the leftover affordance's job is capturing the thought, not live-rendering
    // it a second later in a list that's about to be replaced by the next run anyway.
  }

  const runStatusLabel =
    state.runStatus === "running"
      ? "Untangling…"
      : state.runStatus === "succeeded" || state.runStatus === "partial"
        ? "Untangled"
        : state.runStatus === "failed"
          ? "That run failed"
          : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 rounded-lg border bg-card p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Paste your mess</h2>
          <Link href="/runs" className="font-mono text-xs text-muted-foreground hover:underline">
            View all runs →
          </Link>
        </div>
        <textarea
          value={dumpText}
          onChange={(e) => setDumpText(e.target.value)}
          disabled={isRunning}
          rows={5}
          placeholder="Everything on your mind, unsorted. Untangle will do the rest."
          className="w-full resize-y rounded-md border bg-background p-3 font-serif text-sm leading-relaxed disabled:opacity-60"
          style={{ fontFamily: "var(--font-serif)" }}
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={isRunning || atCeiling || !dumpText.trim()}
          >
            {isRunning ? "Untangling…" : "Untangle"}
          </Button>
          {isEmpty && (
            <Button type="button" variant="outline" onClick={() => setDumpText(SAMPLE_DUMP)}>
              Try this one
            </Button>
          )}
          {runsPerDay !== null && (
            <span className="font-mono text-xs text-muted-foreground">
              {runsToday}/{runsPerDay} today
            </span>
          )}
        </div>
        {atCeiling && (
          <p className="text-xs text-muted-foreground" role="status">
            You&apos;ve used today&apos;s runs. More free tomorrow, or upgrade for headroom now.
          </p>
        )}
        {error && (
          <p className="text-xs text-destructive" role="alert">
            {error}
          </p>
        )}
        {runStatusLabel && (
          <p
            className={cn(
              "font-mono text-xs",
              state.runStatus === "failed" ? "text-destructive" : "text-muted-foreground",
            )}
            role="status"
          >
            {runStatusLabel}
          </p>
        )}
      </div>

      {submittedText && (
        <DumpPanel
          text={submittedText}
          tasks={dumpSpans}
          hoveredTaskId={hoveredTaskId}
          onHoverTask={setHoveredTaskId}
          onCreateFromLeftover={handleCreateFromLeftover}
          creatingSpan={creatingSpan}
        />
      )}
      {leftoverError && (
        <p className="text-xs text-destructive" role="alert">
          {leftoverError}
        </p>
      )}

      <div className="rounded-lg border bg-card p-4">
        <h2 className="mb-3 text-sm font-semibold">The list</h2>
        {displayTasks.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nothing yet — paste something above and Untangle will sort it into tasks.
          </p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {displayTasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                hovered={hoveredTaskId === task.id}
                onHover={setHoveredTaskId}
                onDeleted={(id) => setHiddenIds((prev) => new Set(prev).add(id))}
                onStatusChanged={(id, status) =>
                  setStatusOverride((prev) => new Map(prev).set(id, status))
                }
              />
            ))}
          </ul>
        )}
      </div>

      <RunStrip
        runId={state.runId}
        steps={state.steps}
        totalCostCents={state.totalCostCents}
        live={isRunning}
      />
    </div>
  );
}
