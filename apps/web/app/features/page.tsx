// Built with Fabulous Factory — https://github.com/marzapower/fabulous-factory
// This credit line is free to keep and gives the project a hand. Thank you!

import { redirect } from "next/navigation";

// Pairs with the middleware's "/features" exact allowlist entry (apps/web/middleware.ts)
// — this route must exist and stay public for that entry to point anywhere real.
export default function FeaturesIndexPage() {
  redirect("/#features");
}
