import type { LatestRunSummary, TaskListItem } from "@factory/untangle";

/** The "Today's plan" widget's four mutually-exclusive display states, resolved from its
 * props. Named "jobs-off" / "no-run-yet" / "empty" / "plan" rather than nested booleans
 * so the decision reads the same in the component and in tests. Kept in its own
 * (non-`.tsx`) module — like `format.ts` and `run-reducer.ts` elsewhere in this app — so
 * it can be unit-tested without going through a JSX-aware transform. */
export type TodaysPlanState = "jobs-off" | "no-run-yet" | "empty" | "plan";

export interface TodaysPlanStateInput {
  jobsEnabled: boolean;
  /** The most recent `kind: "daily-plan"` run for this user, or `null` if jobs is off or
   * no such run has happened yet. */
  latestRun: LatestRunSummary | null;
  /** Today's open tasks — see `TodaysPlanProps.openTasks` in `todays-plan.tsx` for the
   * full provenance/ordering contract. Only `.length` matters for this decision. */
  openTasks: TaskListItem[];
}

/** Pure decision extracted out of `TodaysPlan` so its branching can be unit-tested
 * without rendering — see `apps/untangle/test/todays-plan-state.test.ts`. */
export function resolveTodaysPlanState({
  jobsEnabled,
  latestRun,
  openTasks,
}: TodaysPlanStateInput): TodaysPlanState {
  if (!jobsEnabled) return "jobs-off";
  if (!latestRun) return "no-run-yet";
  if (openTasks.length === 0) return "empty";
  return "plan";
}
