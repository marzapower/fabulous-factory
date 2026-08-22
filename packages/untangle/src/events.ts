/**
 * Daily-plan event name + payload (milestone 11, plan K.6). Fired by the cron fan-out
 * (`cron/daily-plan-cron.ts`) and consumed by the per-user worker
 * (`cron/daily-plan-worker.ts`).
 */
export const DAILY_PLAN_EVENT = "untangle/daily-plan.requested" as const;

export interface DailyPlanEventData {
  userId: string;
}
