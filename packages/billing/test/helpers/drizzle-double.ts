/**
 * Test double for the `drizzle-orm` query-operator entry point (`eq`/`and`/`inArray`/
 * `desc`/`sql`) — installed via `vi.mock("drizzle-orm", ...)` in test files that need it
 * (webhook.test.ts, entitlement.test.ts). Real drizzle builds opaque SQL AST objects;
 * this double instead builds plain JS predicate closures / order markers that
 * `db-double.ts`'s in-memory store evaluates directly, keyed by column identity via
 * `columns.ts`'s reverse map — a purpose-built stand-in for the small, fixed set of
 * query shapes this package actually uses, not a general SQL interpreter.
 */
import { resolveColumn } from "./columns";

export type Row = Record<string, unknown>;
export type Predicate = (row: Row) => boolean;

export type OrderMarker =
  { kind: "column-desc"; key: string } | { kind: "raw-desc-nulls-last"; key: string };

export type WhereMarker =
  { kind: "raw-lt"; key: string; value: number } | { kind: "raw-prune"; key: string };

export function eq(column: unknown, value: unknown): Predicate {
  const { key } = resolveColumn(column);
  return (row) => row[key] === value;
}

export function and(...predicates: Predicate[]): Predicate {
  return (row) => predicates.every((predicate) => predicate(row));
}

export function inArray(column: unknown, values: unknown[]): Predicate {
  const { key } = resolveColumn(column);
  return (row) => values.includes(row[key]);
}

export function desc(column: unknown): OrderMarker {
  const { key } = resolveColumn(column);
  return { kind: "column-desc", key };
}

/** Covers exactly the three raw `sql` templates the source uses (entitlement.ts's
 * `NULLS LAST` order, adapters/stripe.ts's `setWhere` strict less-than, and its 30-day
 * prune) — distinguished by literal text + interpolation count, never a real parser. */
export function sql(
  strings: TemplateStringsArray,
  ...values: unknown[]
): OrderMarker | WhereMarker {
  const text = strings.join("§");

  if (text.includes("desc nulls last")) {
    const { key } = resolveColumn(values[0]);
    return { kind: "raw-desc-nulls-last", key };
  }

  if (text.includes("interval '30 days'")) {
    const { key } = resolveColumn(values[0]);
    return { kind: "raw-prune", key };
  }

  if (values.length === 2) {
    const { key } = resolveColumn(values[0]);
    return { kind: "raw-lt", key, value: values[1] as number };
  }

  throw new Error(`billing test double: unrecognized sql template "${text}"`);
}
