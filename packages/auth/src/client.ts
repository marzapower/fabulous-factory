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
// `magicLinkClient` is exported from `better-auth/client/plugins` (verified in the
// installed 1.7.1 dist: `dist/client/plugins/index.d.mts` re-exports it from
// `../../plugins/magic-link/client`) — without it, `authClient.signIn.magicLink` is
// `undefined` at runtime even though the server plugin is configured (plan G.1/G.10.4).
import { magicLinkClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
  plugins: [magicLinkClient()],
});

export const { signIn, signUp, signOut, useSession } = authClient;
