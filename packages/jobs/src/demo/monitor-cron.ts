import { getDb, schema } from "@factory/db";

import { inngest } from "../client";
import { MONITOR_CHECK_EVENT } from "../events";

/** Max events per `step.sendEvent` call (M10 debt, plan G.2.7 follow-up): Inngest caps a
 * single batch send by payload size, not count — 500 is a conservative ceiling that keeps
 * even large monitor fleets well under it. */
const FAN_OUT_CHUNK_SIZE = 500;

/** Pure chunking helper — splits `items` into arrays of at most `size` elements, in
 * order, with a shorter final chunk holding the remainder. No dependency on Inngest or
 * this module's other state, so it's unit-testable on its own. */
export function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

/**
 * Cron scheduler (plan G.2.7 — every 15 minutes, no TZ prefix, UTC fine for polling):
 * lists every monitor id, then fans out ONE `MONITOR_CHECK_EVENT` per monitor via
 * `step.sendEvent` (plan G.1's fan-out idiom). Each monitor gets its own worker run and
 * its own retries — one bad URL can't fail the whole batch (spec §5.5). Above
 * `FAN_OUT_CHUNK_SIZE` monitors, the send is split across multiple `step.sendEvent`
 * calls (ids `fan-out-checks-0`, `fan-out-checks-1`, …) — a single call's payload growing
 * unbounded with the monitor count is a payload-size risk this chunking removes (M10
 * debt from M6).
 */
export const monitorCron = inngest.createFunction(
  { id: "monitor-cron", triggers: [{ cron: "*/15 * * * *" }] },
  async ({ step }) => {
    // JSON-safe string[] — `step.run` return values are `Jsonify`'d (plan G.1).
    const monitorIds = await step.run("list-monitors", async () => {
      const rows = await getDb().select({ id: schema.monitors.id }).from(schema.monitors);
      return rows.map((row) => row.id);
    });

    const chunks = chunk(monitorIds, FAN_OUT_CHUNK_SIZE);
    for (const [index, monitorIdChunk] of chunks.entries()) {
      await step.sendEvent(
        `fan-out-checks-${index}`,
        monitorIdChunk.map((monitorId) => ({ name: MONITOR_CHECK_EVENT, data: { monitorId } })),
      );
    }
  },
);
