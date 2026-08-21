/**
 * In-memory `getDb()` double — installed via `vi.mock("@factory/db", ...)`. Backs the
 * exact chain shapes src/entitlement.ts and src/adapters/stripe.ts use
 * (select/from/where/orderBy/limit, insert/values/onConflictDoNothing/returning,
 * insert/values/onConflictDoUpdate, delete/where, and one level of `.transaction()`),
 * evaluated against a plain `Map`-backed store using the predicate/marker objects
 * `drizzle-double.ts` produces. `.transaction()` snapshots the store and restores it if
 * the callback throws — good enough to prove the H.10.2/19 atomicity contract (the
 * dedupe insert and the cache upsert live or die together) without a real Postgres.
 */
import { resolveColumn, tableNameOf, type TableName } from "./columns";
import type { OrderMarker, Predicate, Row, WhereMarker } from "./drizzle-double";

export interface Store {
  subscriptions: Map<string, Row>;
  billingEvents: Map<string, Row>;
  /** Test hook (H.10.19 rollback regression): when true, the NEXT `onConflictDoUpdate`
   * throws instead of writing, then resets itself — simulates a failure after the
   * dedupe insert already landed inside the same transaction. */
  failNextUpsert: boolean;
}

export function createStore(): Store {
  return { subscriptions: new Map(), billingEvents: new Map(), failNextUpsert: false };
}

function pkOf(table: TableName): string {
  return table === "subscriptions" ? "providerSubscriptionId" : "id";
}

function compareDesc(a: unknown, b: unknown): number {
  const av = a instanceof Date ? a.getTime() : (a as number);
  const bv = b instanceof Date ? b.getTime() : (b as number);
  if (av === bv) return 0;
  return av > bv ? -1 : 1;
}

function applyOrder(rows: Row[], order: OrderMarker | undefined): Row[] {
  if (!order) return rows;
  const sorted = [...rows];
  if (order.kind === "column-desc") {
    sorted.sort((a, b) => compareDesc(a[order.key], b[order.key]));
  } else {
    // raw-desc-nulls-last
    sorted.sort((a, b) => {
      const av = a[order.key];
      const bv = b[order.key];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      return compareDesc(av, bv);
    });
  }
  return sorted;
}

function thenable<T>(run: () => T | Promise<T>) {
  return {
    then(resolve: (value: T) => void, reject?: (reason: unknown) => void) {
      try {
        Promise.resolve(run()).then(resolve, reject);
      } catch (error) {
        if (reject) reject(error);
        else throw error;
      }
    },
  };
}

export function createDbDouble(store: Store) {
  function select(fields: Record<string, unknown>) {
    let table: TableName | undefined;
    let predicate: Predicate = () => true;
    let order: OrderMarker | undefined;

    // Real drizzle applies the caller's `{ alias: column }` projection — e.g.
    // `.select({ customerId: schema.subscriptions.providerCustomerId })` returns rows
    // shaped `{ customerId }`, not `{ providerCustomerId }`. Resolve each alias's
    // underlying storage key ONCE (columns are stable objects) rather than per row.
    const projection = Object.entries(fields).map(([alias, column]) => ({
      alias,
      key: resolveColumn(column).key,
    }));

    const builder = {
      from(t: unknown) {
        table = tableNameOf(t);
        return builder;
      },
      where(pred: Predicate) {
        predicate = pred;
        return builder;
      },
      orderBy(marker: OrderMarker) {
        order = marker;
        return builder;
      },
      limit(n: number) {
        return thenable(() => {
          const rows = [...store[table!].values()].filter(predicate);
          return applyOrder(rows, order)
            .slice(0, n)
            .map((row) => {
              const projected: Row = {};
              for (const { alias, key } of projection) {
                projected[alias] = row[key];
              }
              return projected;
            });
        });
      },
    };
    return builder;
  }

  function insert(t: unknown) {
    const table = tableNameOf(t);
    return {
      values(vals: Row) {
        return {
          onConflictDoNothing() {
            return {
              returning() {
                return thenable(() => {
                  const map = store[table];
                  const key = vals[pkOf(table)] as string;
                  if (map.has(key)) return [];
                  map.set(key, { ...vals });
                  return [{ id: key }];
                });
              },
            };
          },
          onConflictDoUpdate(config: { set: Row; setWhere?: WhereMarker }) {
            return thenable(() => {
              if (store.failNextUpsert) {
                store.failNextUpsert = false;
                throw new Error("billing test double: injected onConflictDoUpdate failure");
              }
              const map = store[table];
              const key = vals[pkOf(table)] as string;
              const existing = map.get(key);
              if (!existing) {
                map.set(key, { ...vals });
                return undefined;
              }
              const allowed =
                !config.setWhere ||
                (config.setWhere.kind === "raw-lt" &&
                  compareLt(existing[config.setWhere.key], config.setWhere.value));
              if (allowed) {
                map.set(key, { ...existing, ...config.set });
              }
              return undefined;
            });
          },
        };
      },
    };
  }

  function del(t: unknown) {
    const table = tableNameOf(t);
    return {
      where(marker: WhereMarker) {
        return thenable(() => {
          const map = store[table];
          if (marker.kind === "raw-prune") {
            const threshold = Date.now() - 30 * 24 * 60 * 60 * 1000;
            for (const [key, row] of map.entries()) {
              const value = row[marker.key];
              const ms = value instanceof Date ? value.getTime() : (value as number);
              if (ms < threshold) map.delete(key);
            }
          }
          return undefined;
        });
      },
    };
  }

  interface DbDouble {
    select: typeof select;
    insert: typeof insert;
    delete: typeof del;
    transaction<T>(fn: (tx: DbDouble) => Promise<T>): Promise<T>;
  }

  const db: DbDouble = {
    select,
    insert,
    delete: del,
    async transaction<T>(fn: (tx: DbDouble) => Promise<T>): Promise<T> {
      const snapshot = {
        subscriptions: new Map(store.subscriptions),
        billingEvents: new Map(store.billingEvents),
      };
      try {
        return await fn(db);
      } catch (error) {
        store.subscriptions = snapshot.subscriptions;
        store.billingEvents = snapshot.billingEvents;
        throw error;
      }
    },
  };
  return db;
}

function compareLt(a: unknown, b: unknown): boolean {
  const av = a instanceof Date ? a.getTime() : (a as number);
  const bv = b instanceof Date ? b.getTime() : (b as number);
  return av < bv;
}
