import { dailyPlanCron } from "../cron/daily-plan-cron";
import { dailyPlanWorker } from "../cron/daily-plan-worker";

/** Every Inngest function the Untangle preset registers — consumed alongside the
 * product's own (generic, `@factory/jobs`-owned) registry by the `serve()` route mount
 * (`apps/untangle`'s `app/api/inngest/route.ts`, plan G.2.8). Kept separate from
 * `@factory/jobs`'s empty registry deliberately: this domain's cron functions ship with
 * the Untangle preset itself, not with the generic jobs infra every preset shares. */
export const functions = [dailyPlanCron, dailyPlanWorker];
