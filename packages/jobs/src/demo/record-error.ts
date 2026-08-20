import { getDb, schema } from "@factory/db";
import { captureException } from "@factory/observability";

import { MAX_SUMMARY_CHARS } from "./constants";

/**
 * Records the SINGLE `'error'` feed event for a monitor (plan G.10.5) — the worker's
 * `onFailure` hook is the only caller on the retry path, so this runs exactly once per
 * exhausted retry cycle, never once per retry attempt.
 *
 * Fail-open by design (own try/catch, never throws): `onFailure` runs after Inngest has
 * already given up on the run, so a failure HERE must not become an unhandled rejection
 * or a second retry cycle — it can only be logged.
 */
export async function recordMonitorError(monitorId: string, message: string): Promise<void> {
  try {
    await getDb()
      .insert(schema.monitorEvents)
      .values({
        monitorId,
        kind: "error",
        source: "none",
        summary: message.slice(0, MAX_SUMMARY_CHARS),
      });
    captureException(new Error(message), { monitorId });
  } catch (error) {
    console.error("[@factory/jobs] recordMonitorError failed:", error);
  }
}
