/**
 * Account-data export (GDPR-style "download my data"). Reads through `@factory/db`'s
 * shared `auth` schema directly (the `auth` → `db` edge is already allowed by the
 * package DAG — see `docs/agents/conventions.md`) rather than going through Better Auth's
 * own API, since neither of these reads is something Better Auth exposes.
 *
 * Uses Drizzle's relational query API (`db.query.<table>.findFirst`/`findMany`, with the
 * `eq`/`and` operators supplied as the callback's second argument) rather than the query
 * builder's bare `select().where(eq(...))` shape — the package DAG confines the bare
 * `drizzle-orm` operator import to packages/db/core/billing/brainstorm/untangle (see
 * `.dependency-cruiser.cjs`'s `no-bare-drizzle-outside-db-core-billing-brainstorm-untangle`
 * rule); packages/auth is explicitly listed as one of the packages that must go through
 * `@factory/db` instead, and the relational query API's callback-supplied operators are
 * how this module stays within that rule without a direct `drizzle-orm` import.
 *
 * Deliberately excludes anything an exported blob must never contain: `session.token`
 * (a live credential — leaking it lets the recipient hijack that session) and any OAuth
 * `accessToken`/`refreshToken`/`idToken` on `account` rows (live third-party credentials,
 * same reasoning). Both tables carry those columns (`packages/db/src/schema/auth.ts`);
 * this module selects an explicit column list (via Drizzle's `columns` query option) so a
 * future column added to either table can never leak into an export by accident.
 */
import { getDb } from "@factory/db";

export interface AccountExport {
  user: {
    id: string;
    name: string;
    email: string;
    emailVerified: boolean;
    createdAt: Date;
  };
  sessions: Array<{
    createdAt: Date;
    ipAddress: string | null;
    userAgent: string | null;
    expiresAt: Date;
  }>;
  accounts: Array<{
    providerId: string;
    createdAt: Date;
  }>;
}

/**
 * The provider id Better Auth 1.7.1 writes to `account.provider_id` for a local
 * email+password account — confirmed directly in its own source, not inferred: the
 * literal `providerId: "credential"` appears at both `dist/api/routes/sign-up.mjs:245`
 * (the account row created on sign-up) and `dist/api/routes/update-user.mjs:222`
 * (`setPassword`, which links a credential account onto a social-only user). Kept as a
 * named constant so `hasCredentialAccount`'s intent is legible without re-deriving it
 * from that source each time.
 */
const CREDENTIAL_PROVIDER_ID = "credential";

export async function buildAccountExport(userId: string): Promise<AccountExport> {
  const db = getDb();

  const userRow = await db.query.user.findFirst({
    columns: { id: true, name: true, email: true, emailVerified: true, createdAt: true },
    where: (user, { eq }) => eq(user.id, userId),
  });

  if (!userRow) {
    throw new Error(`buildAccountExport: no user found for id ${userId}`);
  }

  const sessionRows = await db.query.session.findMany({
    columns: { createdAt: true, ipAddress: true, userAgent: true, expiresAt: true },
    where: (session, { eq }) => eq(session.userId, userId),
  });

  const accountRows = await db.query.account.findMany({
    columns: { providerId: true, createdAt: true },
    where: (account, { eq }) => eq(account.userId, userId),
  });

  return {
    user: userRow,
    sessions: sessionRows,
    accounts: accountRows,
  };
}

export async function hasCredentialAccount(userId: string): Promise<boolean> {
  const row = await getDb().query.account.findFirst({
    columns: { id: true },
    where: (account, { and, eq }) =>
      and(eq(account.userId, userId), eq(account.providerId, CREDENTIAL_PROVIDER_ID)),
  });

  return row !== undefined;
}
