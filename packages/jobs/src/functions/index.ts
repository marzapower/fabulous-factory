import { monitorCron } from "../demo/monitor-cron";
import { monitorWorker } from "../demo/monitor-worker";

/** Every Inngest function this app registers — consumed by the `serve()` route mount
 * (apps/web's `app/api/inngest/route.ts`, plan G.2.8). Generic wiring only: the demo
 * subtree owns which functions exist (plan G.2.2). */
export const functions = [monitorCron, monitorWorker];
