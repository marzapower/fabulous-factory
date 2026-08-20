/**
 * Client-side auth entry (`@factory/auth/client`). NO `server-only` here — this module is
 * imported by "use client" components (`components/auth/{login,signup}-form.tsx`).
 *
 * A top-level `"use client"` directive in this module would be redundant: it exports no
 * components, only `createAuthClient()`'s plain values/hooks, which only ever execute
 * inside whatever client component imports them — the importer's own `"use client"`
 * boundary is what matters (confirmed against better-auth's React client docs/README).
 *
 * No `baseURL` is configured: Better Auth's client defaults to same-origin fetches, which
 * is correct here since the client and the `/api/auth/*` mount are always same-origin.
 */
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient();

export const { signIn, signUp, signOut, useSession } = authClient;
