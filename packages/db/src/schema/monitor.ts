import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { user } from "./auth";

/**
 * Page-monitor demo domain (spec §6, plan G.2.6 as corrected by G.10.1/G.10.15) —
 * `make-it-yours` deletes this file with the rest of the demo.
 *
 * `lastContent` stores the NORMALIZED page text (tags/scripts stripped, whitespace
 * collapsed, capped — plan G.10.6/7): the diff fallback and the LLM's old/new excerpts
 * both need the previous content, not just its hash. `lastHash` is the sha256 of that
 * same normalized text.
 */
export const monitors = pgTable(
  "monitors",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    url: text("url").notNull(),
    lastHash: text("last_hash"),
    lastContent: text("last_content"),
    lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // FK-index precedent (auth.ts's session/account userId indexes) — every monitor
    // lookup (list, count for the MAX_MONITORS cap, ownership check) filters by userId.
    index("monitors_user_id_idx").on(table.userId),
  ],
);

/**
 * Feed rows. `kind`: 'baseline' (first successful check) | 'change' | 'error' (written
 * ONCE per exhausted retry cycle, plan G.10.5). `source`: 'llm' | 'diff' | 'none'.
 */
export const monitorEvents = pgTable(
  "monitor_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    monitorId: uuid("monitor_id")
      .notNull()
      .references(() => monitors.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    summary: text("summary").notNull(),
    source: text("source").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // The feed reads "latest events for my monitors" — index pinned by plan G.10.15.
    index("monitor_events_monitor_id_created_at_idx").on(table.monitorId, table.createdAt.desc()),
  ],
);
