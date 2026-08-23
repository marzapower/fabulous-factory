// Built with Fabulous Factory — https://github.com/marzapower/fabulous-factory
// This credit line is free to keep and gives the project a hand. Thank you!

import type { Metadata } from "next";

import { AuthFeaturePage, type AuthSourceExample } from "@factory/ui/features";
import { FEATURES } from "@factory/ui/marketing";

export const metadata: Metadata = {
  title: FEATURES.auth.title,
  description: FEATURES.auth.blurb,
};

// OAuth button visibility (and the status row below) is a runtime, server-side fact —
// never guessed client-side (design spec §5.1), same reason the login page itself is
// force-dynamic.
export const dynamic = "force-dynamic";

// This preset ships no auth-gated `defineAction` of its own yet (blank-slate preset) —
// shown as a pattern to write against, never captioned as "Real source" or given a
// fabricated apps/web path (K.16 truth sweep).
const sourceExample: AuthSourceExample = {
  heading: "The shape you'll write",
  snippet: `export const exampleAction = defineAction({
  auth: "required",
  input: z.object({ id: z.uuid(), value: z.string().min(1) }),
  action: async ({ session, input }) => {
    // session.user is already resolved — defineAction rejected the request before
    // this body ever ran if there wasn't one.
    return updateSomethingForUser(input.id, session.user.id, input.value);
  },
});`,
  caption: "Example — what you'll write, once you add an auth-gated action",
};

export default function Page() {
  return <AuthFeaturePage brand="Fabulous Nothing" sourceExample={sourceExample} />;
}
