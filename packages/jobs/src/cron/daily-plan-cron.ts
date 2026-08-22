import { eq } from "drizzle-orm";

import { getDb, schema } from "@factory/db";

import { inngest } from "../client";
import { DAILY_PLAN_EVENT } from "../events";

/** Max events per `step.sendEvent` call (carried verbatim from the M6 demo cron, plan
 * K.6/M10 debt): Inngest caps a single batch send by payload size, not count — 500 is a
 * conservative ceiling that keeps even large user bases well under it. */
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
 * Cron scheduler (plan K.6 — daily at 07:00 UTC): lists every user id with at least one
 * open task, then fans out ONE `DAILY_PLAN_EVENT` per user via `step.sendEvent`. Each
 * user gets their own worker run and its own retries — one user's failing digest can't
 * fail the whole batch. Above `FAN_OUT_CHUNK_SIZE` users, the send is split across
 * multiple `step.sendEvent` calls (ids `fan-out-plans-0`, `fan-out-plans-1`, …) — a
 * single call's payload growing unbounded with the user count is a payload-size risk
 * this chunking removes.
 */
export const dailyPlanCron = inngest.createFunction(
  { id: "daily-plan-cron", triggers: [{ cron: "0 7 * * *" }] },
  async ({ step }) => {
    // JSON-safe string[] — `step.run` return values are `Jsonify`'d.
    const userIds = await step.run("list-users", async () => {
      const rows = await getDb()
        .selectDistinct({ userId: schema.tasks.userId })
        .from(schema.tasks)
        .where(eq(schema.tasks.status, "open"));
      return rows.map((row) => row.userId);
    });

    const chunks = chunk(userIds, FAN_OUT_CHUNK_SIZE);
    for (const [index, userIdChunk] of chunks.entries()) {
      await step.sendEvent(
        `fan-out-plans-${index}`,
        userIdChunk.map((userId) => ({ name: DAILY_PLAN_EVENT, data: { userId } })),
      );
    }
  },
);
