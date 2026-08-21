import { and, count, desc, eq, sql } from "drizzle-orm";

import { ApiError } from "@factory/core";
import { getDb, schema } from "@factory/db";

import { hardCeilingMessage, MONITOR_HARD_CEILING, monitorLimitMessage } from "./constants";

/** Re-exported so callers never need to import `@factory/db`'s schema directly for the
 * demo domain (plan G.4). Kept as the full row shape for `createMonitorRow`'s return —
 * every other read here projects away the (up to 200KB) `lastContent`/`lastHash`
 * columns it doesn't need (review fix). */
export type Monitor = typeof schema.monitors.$inferSelect;

/** Everything `listMonitorsForUser` needs to render the dashboard's monitor list —
 * `lastContent`/`lastHash` are check-pipeline internals the UI never displays, and
 * dragging them (up to 200KB each) through every dashboard render is wasted I/O. */
export type MonitorListItem = Omit<Monitor, "lastContent" | "lastHash">;

/** Ownership/existence-check projection — `getMonitorForUser` is only ever used to
 * confirm a monitor exists and belongs to the caller before acting on it. */
export interface MonitorOwnership {
  id: string;
  userId: string;
  name: string;
  url: string;
  lastCheckedAt: Date | null;
}

export interface FeedEvent {
  id: string;
  monitorId: string;
  monitorName: string;
  kind: string;
  summary: string;
  source: string;
  createdAt: Date;
}

const MONITOR_LIST_COLUMNS = {
  id: schema.monitors.id,
  userId: schema.monitors.userId,
  name: schema.monitors.name,
  url: schema.monitors.url,
  lastCheckedAt: schema.monitors.lastCheckedAt,
  createdAt: schema.monitors.createdAt,
} as const;

/** Monitors owned by `userId`, newest first. Projects away `lastContent`/`lastHash`
 * (review fix) — the dashboard list never needs them. */
export async function listMonitorsForUser(userId: string): Promise<MonitorListItem[]> {
  return getDb()
    .select(MONITOR_LIST_COLUMNS)
    .from(schema.monitors)
    .where(eq(schema.monitors.userId, userId))
    .orderBy(desc(schema.monitors.createdAt));
}

/** Count of monitors owned by `userId` — backs the cap check inside `createMonitorRow`,
 * and the dashboard's n/limit chip (the limit itself comes from the caller's resolved
 * entitlement, not from this function). */
export async function countMonitorsForUser(userId: string): Promise<number> {
  const [row] = await getDb()
    .select({ value: count() })
    .from(schema.monitors)
    .where(eq(schema.monitors.userId, userId));
  return row?.value ?? 0;
}

/**
 * Enforces the caller's entitlement cap INSIDE the same transaction as the insert
 * (review fix) — the previous count-then-throw at the action layer raced: two
 * concurrent requests could both read a count one under the cap and both insert,
 * landing the user one over it. `pg_advisory_xact_lock(hashtext('monitor-cap:' ||
 * userId))` serializes concurrent creates for the SAME user (a different user's cap
 * check never blocks on this one), so the count read inside the lock is guaranteed
 * current for the write that follows it.
 *
 * `monitorLimit` ARRIVES as a param, resolved by the caller (plan H.10.9): this function
 * must NEVER call into billing itself (no jobs → billing DAG edge) and must NEVER open a
 * second `getDb()`/transaction inside this one (pool-exhaustion deadlock) — entitlement
 * resolution is entirely the action layer's job. `null` means "no plan-specific limit"
 * (billing disabled, or an unlimited plan), NOT "no limit at all" — the effective cap is
 * always clamped to `MONITOR_HARD_CEILING`, the absolute abuse floor enforced in every
 * profile (plan H.10.16).
 */
export async function createMonitorRow(input: {
  userId: string;
  name: string;
  url: string;
  monitorLimit: number | null;
}): Promise<Monitor> {
  const effectiveLimit =
    input.monitorLimit === null
      ? MONITOR_HARD_CEILING
      : Math.min(input.monitorLimit, MONITOR_HARD_CEILING);
  // The cap that actually fired (H.10 review fix): `null` (unlimited plan / billing
  // disabled) or a plan limit ABOVE the ceiling both mean the ceiling — not the plan — is
  // what's enforcing `effectiveLimit`, and the user-facing wording must say so; a plan
  // limit at or below the ceiling is a real plan restriction, worded accordingly.
  const isHardCeiling = input.monitorLimit === null || input.monitorLimit > MONITOR_HARD_CEILING;

  return getDb().transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${"monitor-cap:" + input.userId}))`);

    const [row] = await tx
      .select({ value: count() })
      .from(schema.monitors)
      .where(eq(schema.monitors.userId, input.userId));
    if ((row?.value ?? 0) >= effectiveLimit) {
      const message = isHardCeiling ? hardCeilingMessage() : monitorLimitMessage(effectiveLimit);
      throw new ApiError(422, "monitor_limit_reached", message);
    }

    const [inserted] = await tx
      .insert(schema.monitors)
      .values({ userId: input.userId, name: input.name, url: input.url })
      .returning();
    if (!inserted) {
      throw new Error("createMonitorRow: insert returned no row");
    }
    return inserted;
  });
}

/** Deletes the monitor iff it belongs to `userId` — scoped by BOTH id and userId so one
 * user can never delete another's monitor via a guessed id. Returns `true` iff a row was
 * actually deleted. */
export async function deleteMonitorRow(id: string, userId: string): Promise<boolean> {
  const deleted = await getDb()
    .delete(schema.monitors)
    .where(and(eq(schema.monitors.id, id), eq(schema.monitors.userId, userId)))
    .returning({ id: schema.monitors.id });
  return deleted.length > 0;
}

/** Ownership-scoped single-row lookup — used by the check-now action (never by the
 * worker path, which is unscoped by design; see `demo/check-monitor.ts`) purely to
 * confirm the monitor exists and belongs to the caller before invoking `checkMonitor`.
 * Projects away `lastContent`/`lastHash` (review fix) — an existence check never needs
 * them. */
export async function getMonitorForUser(
  id: string,
  userId: string,
): Promise<MonitorOwnership | undefined> {
  const [row] = await getDb()
    .select({
      id: schema.monitors.id,
      userId: schema.monitors.userId,
      name: schema.monitors.name,
      url: schema.monitors.url,
      lastCheckedAt: schema.monitors.lastCheckedAt,
    })
    .from(schema.monitors)
    .where(and(eq(schema.monitors.id, id), eq(schema.monitors.userId, userId)));
  return row;
}

/** Latest `limit` feed events across every monitor owned by `userId`, newest first,
 * joined to the monitor for its display name. */
export async function listRecentEventsForUser(userId: string, limit = 20): Promise<FeedEvent[]> {
  const rows = await getDb()
    .select({
      id: schema.monitorEvents.id,
      monitorId: schema.monitorEvents.monitorId,
      monitorName: schema.monitors.name,
      kind: schema.monitorEvents.kind,
      summary: schema.monitorEvents.summary,
      source: schema.monitorEvents.source,
      createdAt: schema.monitorEvents.createdAt,
    })
    .from(schema.monitorEvents)
    .innerJoin(schema.monitors, eq(schema.monitorEvents.monitorId, schema.monitors.id))
    .where(eq(schema.monitors.userId, userId))
    .orderBy(desc(schema.monitorEvents.createdAt))
    .limit(limit);
  return rows;
}
