"use client";

import { Fragment, useMemo } from "react";

import { buildSegments, splitLeftover, type DumpTaskSpan } from "./dump-segments";

export interface DumpPanelProps {
  text: string;
  tasks: DumpTaskSpan[];
  hoveredTaskId: string | null;
  onHoverTask: (id: string | null) => void;
  /**
   * Omitted for a read-only rendering (the landing page's replay): there is no capture
   * row to hang a manual task on, so leftovers must not look clickable. Passing a
   * no-op instead was the bug — the replay rendered eight underlined buttons under a
   * caption inviting you to click them, and clicking did nothing.
   */
  onCreateFromLeftover?: (span: { start: number; end: number; text: string }) => void;
  creatingSpan?: { start: number; end: number } | null;
}

/**
 * "The consuming dump" (K.9's signature interaction). The pasted text never leaves the
 * screen: as `extract` streams, each task's source span highlights, then settles to
 * ~45% opacity — consumed. Text that produced no task stays fully lit, which is both
 * honest (you can see what the model ignored) and useful — click a lit leftover and it
 * becomes a task via `createManualTaskAction`. Consumed spans say so in real text
 * (`aria-label`), not opacity alone, so the distinction survives for a screen-reader
 * user; in read-only mode (no `onCreateFromLeftover`) leftovers are plain text and the
 * caption carries the rest. No SVG leader lines — offsets + highlight state only, so
 * nothing breaks on reflow.
 */
export function DumpPanel({
  text,
  tasks,
  hoveredTaskId,
  onHoverTask,
  onCreateFromLeftover,
  creatingSpan,
}: DumpPanelProps) {
  const segments = useMemo(() => buildSegments(text, tasks), [text, tasks]);
  const titleById = useMemo(() => new Map(tasks.map((t) => [t.id, t.title])), [tasks]);

  return (
    <div className="rounded-lg border bg-fab-paper p-4">
      <h2 className="mb-3 font-mono text-xs tracking-wide text-muted-foreground uppercase">
        Your dump
      </h2>
      <div
        className="whitespace-pre-wrap font-serif text-base leading-relaxed text-foreground"
        style={{ fontFamily: "var(--font-serif)" }}
      >
        {segments.map((segment, i) => {
          const raw = text.slice(segment.start, segment.end);

          if (segment.taskId !== null) {
            const isHovered = hoveredTaskId === segment.taskId;
            const title = titleById.get(segment.taskId) ?? "a task";
            return (
              <span
                key={i}
                id={`source-${segment.taskId}`}
                className="fab-tint rounded-sm"
                style={{
                  opacity: isHovered ? 1 : 0.45,
                  backgroundColor: isHovered ? "var(--fab-live-soft)" : "transparent",
                }}
                aria-label={`Consumed — used by task “${title}”.`}
                onMouseEnter={() => onHoverTask(segment.taskId)}
                onMouseLeave={() => onHoverTask(null)}
              >
                {raw}
              </span>
            );
          }

          if (raw.trim().length === 0) {
            return <span key={i}>{raw}</span>;
          }

          if (!onCreateFromLeftover) {
            // Plain text, not a labelled wrapper: in read-only mode there is nothing to
            // do with a leftover, so the only thing left to convey is the words
            // themselves — which a screen reader already reads. The consumed/leftover
            // distinction stays carried by the consumed spans' own labels plus the
            // caption below.
            return <Fragment key={i}>{raw}</Fragment>;
          }

          return (
            <Fragment key={i}>
              {splitLeftover(raw, segment.start).map((piece, p) => {
                if (!piece.span) {
                  return <Fragment key={p}>{piece.text}</Fragment>;
                }
                const isCreating =
                  creatingSpan?.start === piece.span.start && creatingSpan.end === piece.span.end;
                return (
                  <button
                    key={p}
                    type="button"
                    disabled={isCreating}
                    className="fab-tint rounded-sm text-left underline decoration-dotted decoration-muted-foreground/50 underline-offset-4 hover:bg-fab-live-soft disabled:opacity-60"
                    aria-label={`Not used by any task — add “${piece.text}” as a task.`}
                    onClick={() => onCreateFromLeftover({ ...piece.span!, text: piece.text })}
                  >
                    {piece.text}
                  </button>
                );
              })}
            </Fragment>
          );
        })}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Dim text became a task. Lit text didn&apos;t
        {onCreateFromLeftover ? " — click it to add one yourself." : "."}
      </p>
    </div>
  );
}
