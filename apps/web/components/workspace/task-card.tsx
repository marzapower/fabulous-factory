"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";

import { deleteTaskAction, toggleTaskAction } from "@/app/dashboard/actions";
import { cn } from "@/lib/utils";

import { formatDue } from "./format";
import { PriorityChip } from "./priority-chip";
import type { DisplayTask } from "./types";

export interface TaskCardProps {
  task: DisplayTask;
  hovered: boolean;
  onHover: (id: string | null) => void;
  onDeleted: (id: string) => void;
  onStatusChanged: (id: string, status: "open" | "done") => void;
  depth?: number;
}

/**
 * "The list" (sans voice — product chrome, task titles). Wired to its source span in
 * `DumpPanel` two ways at once, per K.9: `aria-describedby` (so a screen reader
 * announces the underlying text, not just a colour) AND a plain hover pairing (sighted
 * users see both light up together). Entry animation (`fab-enter`) only applies to a
 * task that arrived live this session — a persisted task rendered on first paint never
 * animates (K.9: nothing animates on page load).
 */
export function TaskCard({
  task,
  hovered,
  onHover,
  onDeleted,
  onStatusChanged,
  depth = 0,
}: TaskCardProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const hasSource = task.sourceStart !== null && task.sourceEnd !== null;

  function handleToggle() {
    const next = task.status === "done" ? "open" : "done";
    setError(null);
    startTransition(async () => {
      const outcome = await toggleTaskAction({ id: task.id, status: next });
      if (!outcome.ok) {
        setError(outcome.error.message);
        return;
      }
      onStatusChanged(task.id, next);
    });
  }

  function handleDelete() {
    setError(null);
    startTransition(async () => {
      const outcome = await deleteTaskAction({ id: task.id });
      if (!outcome.ok) {
        setError(outcome.error.message);
        return;
      }
      onDeleted(task.id);
    });
  }

  return (
    <li className={cn(depth > 0 && "ml-6 border-l pl-3")}>
      <div
        className={cn(
          "fab-tint flex items-start justify-between gap-3 rounded-md border bg-card px-3 py-2.5",
          task.isLive && "fab-enter",
        )}
        style={{ borderColor: hovered ? "var(--fab-live)" : undefined }}
        aria-describedby={hasSource ? `source-${task.id}` : undefined}
        onMouseEnter={() => onHover(task.id)}
        onMouseLeave={() => onHover(null)}
      >
        <div className="flex items-start gap-2.5">
          <input
            type="checkbox"
            checked={task.status === "done"}
            disabled={isPending}
            onChange={handleToggle}
            aria-label={task.status === "done" ? "Mark not done" : "Mark done"}
            className="mt-1 size-4 shrink-0 accent-foreground"
          />
          <div className="flex flex-col gap-1">
            <span
              className={cn(
                "text-sm font-medium",
                task.status === "done" && "text-muted-foreground line-through",
              )}
            >
              {task.title}
            </span>
            <div className="flex flex-wrap items-center gap-2 font-mono text-xs text-muted-foreground">
              <span>{formatDue(task.dueAt)}</span>
              {task.effortMinutes !== null && <span>{task.effortMinutes}m</span>}
              {task.tag && <span>#{task.tag}</span>}
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <PriorityChip priority={task.priority} />
          <button
            type="button"
            onClick={handleDelete}
            disabled={isPending}
            aria-label={`Delete “${task.title}”`}
            className="rounded-sm p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
          >
            <Trash2 className="size-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>
      {error && (
        <p className="mt-1 text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
      {task.children.length > 0 && (
        <ul className="mt-1.5 flex flex-col gap-1.5">
          {task.children.map((child) => (
            <TaskCard
              key={child.id}
              task={child}
              hovered={hovered}
              onHover={onHover}
              onDeleted={onDeleted}
              onStatusChanged={onStatusChanged}
              depth={depth + 1}
            />
          ))}
        </ul>
      )}
    </li>
  );
}
