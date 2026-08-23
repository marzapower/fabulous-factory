import Link from "next/link";

import type { LatestRunSummary, TaskListItem } from "@factory/untangle";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@factory/ui/primitives";

import { formatDue } from "../workspace/format";
import { resolveTodaysPlanState } from "./todays-plan-state";

/** How many of the current top open tasks the widget previews — matches
 * `FOCUS_COUNT` in `packages/untangle/src/tasks/daily-plan.ts` (the daily-plan email's
 * own "how many tasks to focus on" constant), kept as an independent literal here rather
 * than imported: that file is the scheduled pipeline's own definition (out of scope for
 * this dashboard-only widget), and the two are allowed to drift on purpose — the widget
 * cares about "a short, glanceable preview", not about matching the email exactly. */
const PLAN_PREVIEW_COUNT = 3;

/** Mirrors the trigger in `packages/untangle/src/cron/daily-plan-cron.ts`
 * (`{ cron: "0 7 * * *" }`) as a human-readable string. Duplicated rather than imported:
 * that file is cron/worker logic (out of scope here) and doesn't export its schedule as
 * a reusable constant — if the cron expression ever changes, this string needs updating
 * alongside it. */
const DAILY_PLAN_SCHEDULE_LABEL = "7:00 UTC";

export interface TodaysPlanProps {
  jobsEnabled: boolean;
  /** The most recent `kind: "daily-plan"` run for this user, or `null` if jobs is off or
   * no such run has happened yet. */
  latestRun: LatestRunSummary | null;
  /** Today's open tasks, `dueAt asc, priority desc` — the SAME ordering and source query
   * (`listOpenTasksForUser`) the daily-plan pipeline's own `gather` step uses. The
   * pipeline's `focus` step narrows this to `FOCUS_COUNT` picks (an LLM re-ranking with
   * per-task reasons, or this same heuristic order when the LLM capability is off) and
   * that narrowed list is never persisted anywhere past the email it was sent in — so
   * this widget can't literally replay what a past email said. What it CAN show
   * honestly, and does, is the live equivalent: today's nearest-due, highest-priority
   * open tasks, right now.
   */
  openTasks: TaskListItem[];
}

/**
 * "Today's plan" dashboard widget (T8) — the in-app surface for the daily-plan feature,
 * which previously only existed as an email (invisible with `email` off, per K.10). Pure
 * server component: everything it renders comes from props resolved server-side in
 * `dashboard/page.tsx`, no client interactivity of its own.
 */
export function TodaysPlan({ jobsEnabled, latestRun, openTasks }: TodaysPlanProps) {
  const state = resolveTodaysPlanState({ jobsEnabled, latestRun, openTasks });
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Today&apos;s plan</CardTitle>
        {jobsEnabled && latestRun && (
          <CardDescription className="font-mono text-xs">
            last sent {latestRun.startedAt.toLocaleDateString()} ·{" "}
            <Link href="/runs" className="hover:underline">
              view runs →
            </Link>
          </CardDescription>
        )}
      </CardHeader>
      <CardContent>
        {state === "jobs-off" ? (
          <p className="text-sm text-muted-foreground">
            The daily plan needs the <code className="font-mono">jobs</code> capability, which is
            off in this deployment. See{" "}
            <Link href="/features/jobs" className="underline underline-offset-2">
              what that unlocks
            </Link>
            .
          </p>
        ) : state === "no-run-yet" ? (
          <p className="text-sm text-muted-foreground">
            Your first plan lands tonight at {DAILY_PLAN_SCHEDULE_LABEL} — a morning pick of what
            matters most from your open tasks.
          </p>
        ) : state === "empty" ? (
          <p className="text-sm text-muted-foreground">
            Nothing open right now — today&apos;s plan was empty too.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {openTasks.slice(0, PLAN_PREVIEW_COUNT).map((task) => (
              <li key={task.id} className="flex items-center justify-between gap-3 text-sm">
                <span className="font-medium">{task.title}</span>
                <span className="shrink-0 font-mono text-xs text-muted-foreground">
                  {formatDue(task.dueAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
