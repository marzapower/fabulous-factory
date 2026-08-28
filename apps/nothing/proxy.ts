import { createLocaleRouting } from "@factory/i18n/middleware";
import { createAuthProxy } from "@factory/ui/middleware";

import { i18n } from "./i18n/config";

// This app has no extra public routes beyond the shared allowlist (@factory/ui/middleware)
// — see that module's doc comment for the full optimistic-allowlist rationale (design spec
// §8.5, plan D.6 + D.9.14). `i18n` is required (D4: a single-locale app is the degraded
// state, there is no off switch) — composes next-intl's own locale routing ahead of the
// allowlist (i18n plan D7/§2.2).
export const proxy = createAuthProxy({ i18n: createLocaleRouting(i18n) });

export const config = {
  matcher: "/((?!_next/static|_next/image|favicon.ico).*)",
};
