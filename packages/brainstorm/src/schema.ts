import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { user } from "@factory/db/schema";

/**
 * Brainstorm domain schema — this package's own migration chain
 * (`../db/migrations/brainstorm`, `drizzle.config.ts`), separate from the shared chain in
 * `packages/db`. `user` is imported from the `@factory/db/schema` SUBPATH, never the
 * package's main barrel (`@factory/db`): that barrel's first line is `import
 * "server-only"`, which would poison `drizzle-kit generate` (an offline Node script, not
 * a React Server Component) if pulled in here.
 *
 * `projectMessages` and `projectItems` both carry a denormalized `userId` alongside their
 * `projectId` FK (same shape `packages/untangle/src/tasks/queries.ts`'s tables use for
 * `runId`-scoped rows) so every query in `./queries.ts` can scope a read/write by BOTH
 * `id` and `userId` directly, without a join back through `projects` on every call.
 */
export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    pitch: text("pitch"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("projects_user_id_updated_at_idx").on(t.userId, t.updatedAt.desc())],
);

/** `role`: 'user' | 'assistant'. */
export const projectMessages = pgTable(
  "project_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    content: text("content").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("project_messages_project_id_created_at_idx").on(t.projectId, t.createdAt),
    index("project_messages_user_id_created_at_idx").on(t.userId, t.createdAt),
  ],
);

/**
 * `kind`: 'idea' | 'feature' | 'note'. `status`: 'proposed' | 'accepted' | 'dismissed' —
 * defaults to 'accepted' at the column level to match `createItemForUser`'s own default
 * for a manually-added item; callers proposing an AI-sourced item pass `status:
 * "proposed"` explicitly. `source`: 'manual' | 'ai'.
 */
export const projectItems = pgTable(
  "project_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    detail: text("detail"),
    status: text("status").notNull().default("accepted"),
    source: text("source").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("project_items_project_id_created_at_idx").on(t.projectId, t.createdAt),
    index("project_items_user_id_status_kind_idx").on(t.userId, t.status, t.kind),
  ],
);
