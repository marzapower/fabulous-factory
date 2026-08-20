import { getDb, schema } from "@factory/db";

import { inngest } from "../client";
import { MONITOR_CHECK_EVENT } from "../events";

/**
 * Cron scheduler (plan G.2.7 — every 15 minutes, no TZ prefix, UTC fine for polling):
 * lists every monitor id, then fans out ONE `MONITOR_CHECK_EVENT` per monitor via a
 * single `step.sendEvent` call (plan G.1's fan-out idiom). Each monitor gets its own
 * worker run and its own retries — one bad URL can't fail the whole batch (spec §5.5).
 */
export const monitorCron = inngest.createFunction(
  { id: "monitor-cron", triggers: [{ cron: "*/15 * * * *" }] },
  async ({ step }) => {
    // JSON-safe string[] — `step.run` return values are `Jsonify`'d (plan G.1).
    const monitorIds = await step.run("list-monitors", async () => {
      const rows = await getDb().select({ id: schema.monitors.id }).from(schema.monitors);
      return rows.map((row) => row.id);
    });

    if (monitorIds.length > 0) {
      await step.sendEvent(
        "fan-out-checks",
        monitorIds.map((monitorId) => ({ name: MONITOR_CHECK_EVENT, data: { monitorId } })),
      );
    }
  },
);
