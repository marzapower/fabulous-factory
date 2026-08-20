/**
 * RSC-facing session helpers, built on `auth.api.getSession({ headers: await headers() })`
 * — the documented Better Auth idiom for reading the session from a server component.
 */
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { auth } from "./auth";

/**
 * The session shape Better Auth infers for this specific `auth` instance —
 * `{ session, user }` — via the `typeof auth.$Infer.Session` idiom (verified against
 * better-auth 1.7.1's `Auth<Options>["$Infer"]` type in node_modules).
 */
export type Session = typeof auth.$Infer.Session;

/** Reads the current session from request headers. Returns `null` when there is none. */
export async function getSession(): Promise<Session | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  return session ?? null;
}

export interface RequireSessionOptions {
  /** @default "/login" */
  redirectTo?: string;
}

/**
 * Reads the current session, redirecting (default `/login`) when there is none.
 * `redirect()` throws Next's internal redirect signal (return type `never`), so
 * everything past the `if` only runs with a non-null session.
 */
export async function requireSession(opts?: RequireSessionOptions): Promise<Session> {
  const session = await getSession();
  if (!session) {
    redirect(opts?.redirectTo ?? "/login");
  }
  return session;
}
