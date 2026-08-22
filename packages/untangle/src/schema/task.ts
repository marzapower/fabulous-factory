import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { user } from "@factory/db/schema";

import { runs } from "./run";

/**
 * Task-capture domain (milestone 11, plan K.2.2 as corrected by K.14 M7) — this is the
 * "renameable" half of the M11 split (K.1.3): `make-it-yours` Phase 2 renames this file
 * and everything under `packages/untangle/src/tasks/` to the adopter's own noun, while
 * `run.ts` (the engine) is inherited verbatim. This file is allowed to import `run.ts`
 * (`tasks.runId` references `runs.id`) — the dependency is one-way, and `run.ts` must
 * never import back from here.
 */
export const captures = pgTable(
  "captures",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** 'paste' | 'url' */
    source: text("source").notNull(),
    /** The URL, when source = 'url'. */
    url: text("url"),
    /** Normalized text actually fed to the pipeline, capped at MAX_CAPTURE_CHARS. */
    rawText: text("raw_text").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("captures_user_id_idx").on(t.userId)],
);

/**
 * `parentTaskId` is a self-reference — drizzle requires the explicit `AnyPgColumn`
 * return annotation on the callback, imported from `drizzle-orm/pg-core`, or TS7024
 * fires (K.2.3 nit).
 */
export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    runId: uuid("run_id").references(() => runs.id, { onDelete: "set null" }),
    captureId: uuid("capture_id").references(() => captures.id, { onDelete: "set null" }),
    parentTaskId: uuid("parent_task_id").references((): AnyPgColumn => tasks.id, {
      onDelete: "cascade",
    }),
    title: text("title").notNull(),
    /** 'now' | 'next' | 'later' | null (untriaged) */
    priority: text("priority"),
    effortMinutes: integer("effort_minutes"),
    dueAt: timestamp("due_at", { withTimezone: true }),
    tag: text("tag"),
    /** 'open' | 'done' */
    status: text("status").notNull().default("open"),
    /** 'llm' | 'heuristic' | 'manual' — provenance of the row itself. */
    source: text("source").notNull(),
    /** Character offsets into captures.raw_text; null when not locatable. */
    sourceStart: integer("source_start"),
    sourceEnd: integer("source_end"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [
    index("tasks_user_id_status_idx").on(t.userId, t.status),
    index("tasks_parent_task_id_idx").on(t.parentTaskId),
    index("tasks_run_id_idx").on(t.runId),
  ],
);
