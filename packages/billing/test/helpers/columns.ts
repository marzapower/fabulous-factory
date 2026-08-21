/**
 * Column-identity reverse map shared by the drizzle-orm and `@factory/db` test doubles
 * (test/helpers/drizzle-double.ts, test/helpers/db-double.ts). `schema.subscriptions`/
 * `schema.billingEvents` are REAL `@factory/db` table objects — every column object
 * src/adapters/stripe.ts and src/entitlement.ts pass to `eq`/`and`/`inArray`/`desc`/
 * `sql` is one of THESE objects, so a reverse `column -> { table, key }` map built once
 * from `Object.entries` is all the "SQL" the fakes ever need to understand.
 *
 * Deliberately LAZY (`initColumns`, called once from each test file's `@factory/db`
 * mock factory) rather than a top-level `import ... from "@factory/db/schema"` here:
 * this file is reached from INSIDE the `drizzle-orm` mock factory (via
 * drizzle-double.ts), and `@factory/db/schema` itself needs the REAL `relations` export
 * off `drizzle-orm` (via `schema/auth.ts`) — a static import here would make the
 * `drizzle-orm` mock factory transitively wait on its own not-yet-resolved promise
 * (real deadlock, reproduced while building this suite). Deferring the schema handoff
 * to a plain function call, invoked once `@factory/db/schema` has ACTUALLY finished
 * loading elsewhere, breaks that cycle.
 */
export type TableName = "subscriptions" | "billingEvents";

interface MinimalSchema {
  subscriptions: Record<string, unknown>;
  billingEvents: Record<string, unknown>;
}

let reverse: Map<unknown, { table: TableName; key: string }> | undefined;
let tables: MinimalSchema | undefined;

/** Call once (idempotent) with the real `@factory/db/schema` module, from the
 * `@factory/db` mock factory — the one place that already loads it. */
export function initColumns(schema: MinimalSchema): void {
  if (reverse) return;
  tables = schema;
  reverse = new Map();
  for (const [key, col] of Object.entries(schema.subscriptions)) {
    reverse.set(col, { table: "subscriptions", key });
  }
  for (const [key, col] of Object.entries(schema.billingEvents)) {
    reverse.set(col, { table: "billingEvents", key });
  }
}

export function resolveColumn(value: unknown): { table: TableName; key: string } {
  if (!reverse) {
    throw new Error("billing test double: columns.ts used before initColumns() ran");
  }
  const found = reverse.get(value);
  if (!found) {
    throw new Error(
      "billing test double: unrecognized column object — extend the fakes to cover it",
    );
  }
  return found;
}

export function tableNameOf(table: unknown): TableName {
  if (!tables) {
    throw new Error("billing test double: columns.ts used before initColumns() ran");
  }
  if (table === tables.subscriptions) return "subscriptions";
  if (table === tables.billingEvents) return "billingEvents";
  throw new Error("billing test double: unrecognized table object");
}
