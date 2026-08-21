/**
 * Real-Postgres webhook integration test (plan H.4/H.5), mirroring the house idiom
 * (packages/llm/test/integration/record.test.ts, packages/core/test/integration/
 * rate-limit.test.ts, packages/db/test/integration/migrations.test.ts): shared advisory
 * lock 4230011 serializes this suite against the others in the disposable database, a
 * fresh schema + the real migrator runs per test, and `DATABASE_URL` is set directly
 * from `TEST_DATABASE_URL` (not through `readMergedEnv`) — the one documented exception.
 *
 * Nothing is mocked here — real `@factory/db`, real `drizzle-orm`, real `stripe` SDK
 * (dummy key, no network — signing/verification are pure local HMAC). This is the ONE
 * place proving the actual SQL (the `onConflictDoUpdate`/`setWhere` upsert, the
 * `billing_events` dedupe insert) against a real Postgres, not the in-memory doubles the
 * unit suites use.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { sql } from "drizzle-orm";
import { Client, Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { buildEvent, buildSignedRequest, buildSubscription } from "../helpers/stripe-fixtures";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_FOLDER = path.resolve(__dirname, "../../../db/migrations");

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

if (!TEST_DATABASE_URL) {
  console.warn(
    "integration tests skipped: set TEST_DATABASE_URL to run packages/billing webhook integration tests against a real Postgres instance.",
  );
}

describe.skipIf(!TEST_DATABASE_URL)("stripe adapter handleWebhook (integration)", () => {
  const pool = new Pool({ connectionString: TEST_DATABASE_URL });
  const db = drizzle({ client: pool });

  const INTEGRATION_DB_LOCK_KEY = 4230011;
  const lockClient = new Client({ connectionString: TEST_DATABASE_URL });

  beforeAll(async () => {
    await lockClient.connect();
    await lockClient.query("SELECT pg_advisory_lock($1)", [INTEGRATION_DB_LOCK_KEY]);
  }, 120_000);

  beforeEach(async () => {
    await pool.query(
      "DROP SCHEMA IF EXISTS drizzle CASCADE; DROP SCHEMA public CASCADE; CREATE SCHEMA public;",
    );
    await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });

    // `getDb()`/`getEnv()` are memoized process-wide — set BEFORE the dynamic import
    // below, never via a static top-of-file import (F.10.6 idiom).
    process.env.DATABASE_URL = TEST_DATABASE_URL;
    // M8: BETTER_AUTH_SECRET is now required (I.3.a) — the stripe adapter calls
    // `getEnv()` directly (`:28`, `:239`), which would otherwise throw EnvValidationError
    // before this suite's real webhook-handling logic ever runs.
    process.env.BETTER_AUTH_SECRET = "test-suite-better-auth-secret-16plus-chars";
    process.env.STRIPE_SECRET_KEY = "sk_test_dummy";
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_secret";
    process.env.APP_URL = "https://example.test";
  });

  afterAll(async () => {
    await lockClient.query("SELECT pg_advisory_unlock($1)", [INTEGRATION_DB_LOCK_KEY]);
    await lockClient.end();
    await pool.end();
  });

  it("a signed subscription event creates a real subscriptions row", async () => {
    const { stripeProvider } = await import("../../src/adapters/stripe");

    const subscription = buildSubscription({
      id: "sub_integration_1",
      metadata: { userId: "user_integration_1" },
    });
    const event = buildEvent({
      id: "evt_integration_1",
      type: "customer.subscription.created",
      dataObject: subscription,
    });

    // The FK to `user` (H.10.5's schema) requires a real row — the webhook path itself
    // never creates users, so seed one directly.
    await db.execute(
      sql`insert into "user" (id, name, email, email_verified, created_at, updated_at) values ('user_integration_1', 'Test User', 'user_integration_1@example.test', true, now(), now())`,
    );

    const res = await stripeProvider.handleWebhook(buildSignedRequest(event, "whsec_test_secret"));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ received: true });

    const rows = await db.execute<{
      provider_subscription_id: string;
      user_id: string;
      status: string;
      plan_id: string;
    }>(sql`select * from subscriptions where provider_subscription_id = 'sub_integration_1'`);
    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0]).toMatchObject({ user_id: "user_integration_1", status: "active" });

    const eventRows = await db.execute(
      sql`select id from billing_events where id = 'evt_integration_1'`,
    );
    expect(eventRows.rows).toHaveLength(1);
  });

  it("a stale event.created (strict <) → 200 and the row is UNCHANGED, proving the real setWhere emission against Postgres", async () => {
    const { stripeProvider } = await import("../../src/adapters/stripe");

    await db.execute(
      sql`insert into "user" (id, name, email, email_verified, created_at, updated_at) values ('user_integration_stale', 'Test User Stale', 'user_integration_stale@example.test', true, now(), now())`,
    );

    const fresh = buildSubscription({
      id: "sub_integration_stale",
      metadata: { userId: "user_integration_stale" },
      status: "active",
    });
    const freshEvent = buildEvent({
      id: "evt_integration_stale_fresh",
      type: "customer.subscription.updated",
      created: 1_700_000_100,
      dataObject: fresh,
    });
    const freshRes = await stripeProvider.handleWebhook(
      buildSignedRequest(freshEvent, "whsec_test_secret"),
    );
    expect(freshRes.status).toBe(200);

    const afterFresh = await db.execute<{ status: string; last_event_created: number }>(
      sql`select status, last_event_created::int as last_event_created from subscriptions where provider_subscription_id = 'sub_integration_stale'`,
    );
    expect(afterFresh.rows).toHaveLength(1);
    expect(afterFresh.rows[0]).toMatchObject({
      status: "active",
      last_event_created: 1_700_000_100,
    });

    // A DIFFERENT, older-dated event for the SAME subscription — must not win (STRICT
    // less-than on `setWhere`, H.10.13). This is the one place that guard's actual SQL
    // (`onConflictDoUpdate({ setWhere: ... })`) is proven against a real Postgres rather
    // than the in-memory double the unit suite uses.
    const stale = buildSubscription({
      id: "sub_integration_stale",
      metadata: { userId: "user_integration_stale" },
      status: "canceled",
    });
    const staleEvent = buildEvent({
      id: "evt_integration_stale_old",
      type: "customer.subscription.updated",
      created: 1_700_000_000, // 100 seconds BEFORE the already-applied event
      dataObject: stale,
    });
    const staleRes = await stripeProvider.handleWebhook(
      buildSignedRequest(staleEvent, "whsec_test_secret"),
    );
    expect(staleRes.status).toBe(200);

    const afterStale = await db.execute<{ status: string; last_event_created: number }>(
      sql`select status, last_event_created::int as last_event_created from subscriptions where provider_subscription_id = 'sub_integration_stale'`,
    );
    expect(afterStale.rows).toHaveLength(1);
    // UNCHANGED — still the fresh event's values, not the stale event's.
    expect(afterStale.rows[0]).toMatchObject({
      status: "active",
      last_event_created: 1_700_000_100,
    });
  });

  it("a failure inside the dedupe transaction (FK violation on an unresolvable userId) rolls back the dedupe row too, and redelivery with a valid userId processes fully", async () => {
    const { stripeProvider } = await import("../../src/adapters/stripe");

    // No user row is seeded for 'user_integration_missing' — `subscriptions.user_id`
    // references `user.id` ON DELETE CASCADE (H.10.5's schema), so the insert inside
    // `upsertSubscriptionFromEvent` fails with a real FK-violation error AFTER the
    // dedupe row has already been inserted earlier in the SAME transaction. This is the
    // simplest REAL-Postgres failure available on the happy path: the adapter itself
    // performs no pre-insert existence check on `metadata.userId` (by design — it trusts
    // Stripe's metadata, set by our own checkout), so a forged/mismatched userId is a
    // genuine, reachable failure mode, not a contrived one.
    const badSub = buildSubscription({
      id: "sub_integration_rollback",
      metadata: { userId: "user_integration_missing" },
    });
    const badEvent = buildEvent({
      id: "evt_integration_rollback",
      type: "customer.subscription.created",
      dataObject: badSub,
    });

    await expect(
      stripeProvider.handleWebhook(buildSignedRequest(badEvent, "whsec_test_secret")),
    ).rejects.toThrow();

    // The dedupe row must NOT survive the rollback — otherwise Stripe's redelivery of the
    // same event.id would be (wrongly) treated as an already-seen replay and dropped
    // forever, silently losing the subscription.
    const eventRowsAfterFailure = await db.execute(
      sql`select id from billing_events where id = 'evt_integration_rollback'`,
    );
    expect(eventRowsAfterFailure.rows).toHaveLength(0);
    const subRowsAfterFailure = await db.execute(
      sql`select provider_subscription_id from subscriptions where provider_subscription_id = 'sub_integration_rollback'`,
    );
    expect(subRowsAfterFailure.rows).toHaveLength(0);

    // Redelivery of the SAME event.id, now with a real user seeded and referenced,
    // processes fully — proving the rollback didn't poison the dedupe ledger.
    await db.execute(
      sql`insert into "user" (id, name, email, email_verified, created_at, updated_at) values ('user_integration_missing', 'Test User Recovered', 'user_integration_missing@example.test', true, now(), now())`,
    );
    const goodSub = buildSubscription({
      id: "sub_integration_rollback",
      metadata: { userId: "user_integration_missing" },
    });
    const goodEvent = buildEvent({
      id: "evt_integration_rollback",
      type: "customer.subscription.created",
      dataObject: goodSub,
    });
    const res = await stripeProvider.handleWebhook(
      buildSignedRequest(goodEvent, "whsec_test_secret"),
    );
    expect(res.status).toBe(200);

    const eventRowsAfterRetry = await db.execute(
      sql`select id from billing_events where id = 'evt_integration_rollback'`,
    );
    expect(eventRowsAfterRetry.rows).toHaveLength(1);
    const subRowsAfterRetry = await db.execute(
      sql`select provider_subscription_id from subscriptions where provider_subscription_id = 'sub_integration_rollback'`,
    );
    expect(subRowsAfterRetry.rows).toHaveLength(1);
  });

  it("replaying the same event.id still leaves exactly one subscriptions row and one billing_events row", async () => {
    const { stripeProvider } = await import("../../src/adapters/stripe");

    await db.execute(
      sql`insert into "user" (id, name, email, email_verified, created_at, updated_at) values ('user_integration_2', 'Test User 2', 'user_integration_2@example.test', true, now(), now())`,
    );

    const subscription = buildSubscription({
      id: "sub_integration_2",
      metadata: { userId: "user_integration_2" },
    });
    const event = buildEvent({
      id: "evt_integration_2",
      type: "customer.subscription.created",
      dataObject: subscription,
    });

    const first = await stripeProvider.handleWebhook(
      buildSignedRequest(event, "whsec_test_secret"),
    );
    expect(first.status).toBe(200);
    const second = await stripeProvider.handleWebhook(
      buildSignedRequest(event, "whsec_test_secret"),
    );
    expect(second.status).toBe(200);

    const subRows = await db.execute(
      sql`select * from subscriptions where provider_subscription_id = 'sub_integration_2'`,
    );
    expect(subRows.rows).toHaveLength(1);

    const eventRows = await db.execute(
      sql`select id from billing_events where id = 'evt_integration_2'`,
    );
    expect(eventRows.rows).toHaveLength(1);
  });
});
