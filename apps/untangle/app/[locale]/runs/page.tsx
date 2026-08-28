import { requireSession } from "@factory/auth";
import { Link } from "@factory/i18n/navigation";
import { localizedHref, setRequestLocale } from "@factory/i18n/server";
import { getRunForUser, isStaleRun, listRunsForUser, type RunDetail } from "@factory/untangle";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@factory/ui/primitives";
import { formatCents, formatDateTime, formatDuration } from "@/components/workspace/format";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const RUN_HISTORY_LIMIT = 20;

const STEP_STATUS_GLYPH: Record<string, string> = {
  running: "●",
  succeeded: "✓",
  failed: "✕",
  skipped: "–",
};

/**
 * Run history (m11-untangle-workspace.md K.8.3) — "the page a technical evaluator
 * screenshots". One row per run with every step's model, tokens, cost, duration and
 * driver, in mono, dense, without ornament — this is server-rendered from
 * `RunDetail`/`RunStepRow` (both carry real numeric token counts, unlike the live
 * `RunEvent` stream, whose `step` frame doesn't — see `run-strip.tsx`'s doc comment).
 * `interrupted` is derived via `isStaleRun`, never a stored status (K.1.7 — a run left
 * "running" past `RUN_STALE_AFTER_MS` reads as interrupted; nothing reaps it).
 */
export default async function RunsPage({ params }: { params: Promise<{ locale: string }> }) {
  setRequestLocale((await params).locale);
  const session = await requireSession({ redirectTo: await localizedHref("/login") });
  const runs = await listRunsForUser(session.user.id, RUN_HISTORY_LIMIT);
  const details = await Promise.all(runs.map((run) => getRunForUser(run.id, session.user.id)));

  return (
    <main className="fab-shell mx-auto flex min-h-svh max-w-3xl flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Runs</h1>
        <Link href="/dashboard" className="font-mono text-xs text-muted-foreground hover:underline">
          ← Back to Untangle
        </Link>
      </div>

      {details.length === 0 ? (
        <Card>
          <CardContent className="py-6 text-sm text-muted-foreground">
            No runs yet — untangle something from the dashboard and it&apos;ll show up here.
          </CardContent>
        </Card>
      ) : (
        <ul className="flex flex-col gap-4">
          {details.map((run) => run && <RunRow key={run.id} run={run} />)}
        </ul>
      )}
    </main>
  );
}

function RunRow({ run }: { run: RunDetail }) {
  const interrupted = isStaleRun(run.status, run.startedAt);
  const displayStatus = interrupted ? "interrupted" : run.status;

  return (
    <li>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="font-mono text-sm">
              {run.kind} · {run.id.slice(0, 8)}
            </CardTitle>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 font-mono text-xs",
                displayStatus === "succeeded" && "bg-foreground text-background",
                displayStatus === "partial" && "border border-foreground",
                (displayStatus === "failed" || displayStatus === "interrupted") &&
                  "border border-destructive text-destructive",
                displayStatus === "running" && "text-muted-foreground",
              )}
            >
              {displayStatus}
            </span>
          </div>
          <CardDescription className="font-mono text-xs">
            {run.driver} · {formatDateTime(run.startedAt)} · {formatCents(run.totalCostCents)}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="flex flex-col gap-1 font-mono text-xs">
            {run.steps.map((step) => (
              <li key={step.id} className="flex flex-wrap items-center gap-2">
                <span aria-hidden="true" className="w-3 text-muted-foreground">
                  {STEP_STATUS_GLYPH[step.status] ?? "?"}
                </span>
                <span className="w-24 shrink-0">{step.key}</span>
                <span className="text-muted-foreground">{step.status}</span>
                {step.model && <span className="text-muted-foreground">· {step.model}</span>}
                <span className="text-muted-foreground">· source: {step.source}</span>
                {(step.inputTokens !== null || step.outputTokens !== null) && (
                  <span className="text-muted-foreground">
                    · {(step.inputTokens ?? 0) + (step.outputTokens ?? 0)}t
                  </span>
                )}
                <span className="ml-auto text-muted-foreground">
                  {formatDuration(step.durationMs)}
                </span>
                <span className="text-muted-foreground">{formatCents(step.costCents)}</span>
                {step.attempt > 1 && (
                  <span className="text-muted-foreground">attempt {step.attempt}</span>
                )}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </li>
  );
}
