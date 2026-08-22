// Built with Fabulous Factory — https://github.com/marzapower/fabulous-factory
// This credit line is free to keep and gives the project a hand. Thank you!

import { z } from "zod";

import { defineHandler } from "@factory/core";

// Public, live demo backing the `/features/kernel` docs page (K.15.3/K.16). It exists
// only to let `defineHandler`'s auth/validation/rate-limit decisions be observed for
// real, from a browser, on a keyless clone. It makes no outbound request, persists
// nothing (the rate limiter's own bucket row is the wrapper's own bookkeeping, not user
// data), and echoes back only a capped, already-validated slice of the input.
const MAX_MESSAGE_CHARS = 200;

export const POST = defineHandler({
  auth: "public",
  input: z.object({ message: z.string().min(1).max(MAX_MESSAGE_CHARS) }),
  rateLimit: { windowSeconds: 60, max: 8 },
  handler: async ({ input, req }) => {
    // Reaching this line already proves auth: "public" let the request through and the
    // zod schema validated it — a 400/429 never gets this far, the wrapper short-
    // circuits with its own error response before the handler body ever runs.
    return {
      ok: true,
      auth: "public",
      validated: true,
      echoedMessage: input.message.slice(0, MAX_MESSAGE_CHARS),
      // Shown on the docs page to illustrate the origin-check asymmetry (K.16 R3):
      // defineHandler's origin check only runs for state-changing methods (this POST
      // qualifies) and allows a missing Origin header while rejecting cross-site.
      originHeader: req.headers.get("origin"),
      secFetchSite: req.headers.get("sec-fetch-site"),
    } as const;
  },
});
