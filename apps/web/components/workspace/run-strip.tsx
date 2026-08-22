import { cn } from "@/lib/utils";

import { formatCents, formatDuration } from "./format";
import type { WorkspaceStep } from "./run-reducer";

const STATUS_GLYPH: Record<WorkspaceStep["status"], string> = {
  queued: "○",
  running: "●",
  succeeded: "✓",
  failed: "✕",
  skipped: "–",
};

export interface RunStripProps {
  runId: string | null;
  steps: WorkspaceStep[];
  totalCostCents: number | null;
  live: boolean;
}

/**
 * The run strip — mono voice, machine data only: step key, status, model, cost,
 * duration. `--fab-live` tints the currently-running step's glyph only while the run is
 * executing (`live`); once the run finishes, that tint is gone (the CSS rule reads
 * `live && status === "running"`, which is never true after `run-finished` lands) —
 * the drain in K.9 is achieved by the tint simply having nothing left to apply to,
 * transitioned via `.fab-tint`'s 600ms color transition rather than a keyframe.
 */
export function RunStrip({ runId, steps, totalCostCents, live }: RunStripProps) {
  if (!runId) return null;

  return (
    <div className="rounded-lg border bg-card p-4 font-mono text-xs">
      <div className="mb-2 flex items-center justify-between text-muted-foreground">
        <span>run {runId.slice(0, 8)}</span>
        <span>{formatCents(totalCostCents)}</span>
      </div>
      <ul className="flex flex-col gap-1.5">
        {steps.map((step) => {
          const isActive = live && step.status === "running";
          return (
            <li
              key={step.key}
              className="fab-tint flex flex-wrap items-center gap-2 rounded-sm px-1.5 py-1"
              style={{ backgroundColor: isActive ? "var(--fab-live-soft)" : "transparent" }}
            >
              <span
                aria-hidden="true"
                className={cn("w-3", isActive && "text-[color:var(--fab-live)]")}
              >
                {STATUS_GLYPH[step.status]}
              </span>
              <span className="w-24 shrink-0 text-foreground">{step.label}</span>
              <span className="text-muted-foreground">{step.status}</span>
              {step.model && <span className="text-muted-foreground">· {step.model}</span>}
              {step.source && step.source !== "none" && (
                <span className="text-muted-foreground">· source: {step.source}</span>
              )}
              <span className="ml-auto text-muted-foreground">
                {formatDuration(step.durationMs)}
              </span>
              <span className="text-muted-foreground">{formatCents(step.costCents)}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
