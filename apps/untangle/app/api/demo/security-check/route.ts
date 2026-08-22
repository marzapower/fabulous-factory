// Built with Fabulous Factory — https://github.com/marzapower/fabulous-factory
// This credit line is free to keep and gives the project a hand. Thank you!

import { z } from "zod";

import { defineHandler, isBlockedAddress } from "@factory/core";

// Public, live demo backing the `/features/security` docs page (K.16 N1). Evaluates the
// pure `isBlockedAddress` predicate against an IP-address LITERAL — never a hostname —
// and stops there: no DNS lookup, no `safeFetch`, no outbound connection of any kind is
// ever made from this route. That is exactly what makes it safe to expose publicly.
//
// `isBlockedAddress` takes an IP literal, not a hostname: it `net.isIPv4`/`isIPv6`-checks
// its input and fails closed (blocked) for anything that parses as neither. The docs page
// labels the input "IP address" and pre-seeds literals rather than inviting a hostname,
// which would render a false "BLOCKED" and misrepresent the guard. The real defense
// against a DNS-rebinding attacker is `createValidatingConnector`'s POST-CONNECT check
// (`packages/core/src/safe-fetch.ts`), which this route does not and must not exercise —
// that would require making a real outbound connection on user input.
const MAX_ADDRESS_CHARS = 64;

export const POST = defineHandler({
  auth: "public",
  input: z.object({ address: z.string().min(1).max(MAX_ADDRESS_CHARS) }),
  rateLimit: { windowSeconds: 60, max: 20 },
  handler: async ({ input }) => {
    return {
      address: input.address,
      blocked: isBlockedAddress(input.address),
    } as const;
  },
});
