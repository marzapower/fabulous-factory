import { NonRetriableError } from "inngest";

import { inngest } from "../client";
import { MONITOR_CHECK_EVENT } from "../events";
import { checkMonitor } from "./check-monitor";
import { recordMonitorError } from "./record-error";

/**
 * Per-monitor check worker (plan G.4/G.10.5). `checkMonitor` never writes an `'error'`
 * event itself — it throws, and `onFailure` (which runs exactly ONCE, after all retries
 * are exhausted) is the single place on this path that records one, via
 * `recordMonitorError`. A missing monitor is non-retriable — retrying a check for a
 * monitor that was deleted mid-flight can never succeed.
 */
export const monitorWorker = inngest.createFunction(
  {
    id: "monitor-check",
    triggers: [{ event: MONITOR_CHECK_EVENT }],
    retries: 3,
    onFailure: async ({ event, error }) => {
      const monitorId = event.data.event.data.monitorId as string;
      await recordMonitorError(monitorId, error.message);
    },
  },
  async ({ event, step }) => {
    return step.run("check", async () => {
      try {
        return await checkMonitor(event.data.monitorId);
      } catch (err) {
        if (
          err instanceof Error &&
          (err as Error & { code?: string }).code === "MONITOR_NOT_FOUND"
        ) {
          throw new NonRetriableError(err.message, { cause: err });
        }
        throw err;
      }
    });
  },
);
