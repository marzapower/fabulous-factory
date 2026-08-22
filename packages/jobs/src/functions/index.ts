import { dailyPlanCron } from "../cron/daily-plan-cron";
import { dailyPlanWorker } from "../cron/daily-plan-worker";

/** Every Inngest function this app registers — consumed by the `serve()` route mount
 * (apps/web's `app/api/inngest/route.ts`, plan G.2.8). Generic wiring only: the cron
 * subtree owns which functions exist (plan K.6). */
export const functions = [dailyPlanCron, dailyPlanWorker];
