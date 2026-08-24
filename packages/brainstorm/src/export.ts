/**
 * Full user-data export for the brainstorm domain (projects/project_messages/
 * project_items) — the "download my data" counterpart to
 * `packages/auth/src/export.ts`'s account export. Every table here carries its own
 * `userId` column (`./schema.ts`'s doc comment on why — denormalized onto every row so
 * every read can scope by `userId` directly, no join needed), so this is a plain
 * `userId`-scoped read per table, same shape `./queries.ts`'s own reads use.
 *
 * Same explicit-column-list discipline as `packages/auth/src/export.ts` ("a future column
 * can never leak by accident"): every `select()` below names its columns rather than
 * reading the whole row. `userId` is omitted from every projection — it's the caller's own
 * id by construction (that's what the `where` clause scopes on), so it's redundant, not
 * sensitive.
 *
 * `packages/brainstorm` is one of the packages the DAG's
 * `no-bare-drizzle-outside-db-core-billing-brainstorm-untangle` rule allows to import the
 * bare `drizzle-orm` query-operator entry point directly (see `.dependency-cruiser.cjs`),
 * so this reuses the same `eq` pattern `./queries.ts` already uses, rather than the
 * relational query API `packages/auth/src/export.ts` had to fall back to (that package is
 * NOT on the allowlist).
 */
import { eq } from "drizzle-orm";

import { getDb } from "@factory/db";

import * as schema from "./schema";

export async function exportUserData(userId: string): Promise<Record<string, unknown>> {
  const db = getDb();

  const projectRows = await db
    .select({
      id: schema.projects.id,
      name: schema.projects.name,
      pitch: schema.projects.pitch,
      createdAt: schema.projects.createdAt,
      updatedAt: schema.projects.updatedAt,
    })
    .from(schema.projects)
    .where(eq(schema.projects.userId, userId));

  const projectMessageRows = await db
    .select({
      id: schema.projectMessages.id,
      projectId: schema.projectMessages.projectId,
      role: schema.projectMessages.role,
      content: schema.projectMessages.content,
      createdAt: schema.projectMessages.createdAt,
    })
    .from(schema.projectMessages)
    .where(eq(schema.projectMessages.userId, userId));

  const projectItemRows = await db
    .select({
      id: schema.projectItems.id,
      projectId: schema.projectItems.projectId,
      kind: schema.projectItems.kind,
      title: schema.projectItems.title,
      detail: schema.projectItems.detail,
      status: schema.projectItems.status,
      source: schema.projectItems.source,
      createdAt: schema.projectItems.createdAt,
      updatedAt: schema.projectItems.updatedAt,
    })
    .from(schema.projectItems)
    .where(eq(schema.projectItems.userId, userId));

  return {
    projects: projectRows,
    projectMessages: projectMessageRows,
    projectItems: projectItemRows,
  };
}
