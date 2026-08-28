import { createLocaleRouting } from "@factory/i18n/middleware";
import { createAuthProxy } from "@factory/ui/middleware";

import { i18n } from "./i18n/config";

// `/dashboard`, `/projects/*` (a project's chat + board) and `/api/chat` (the streaming
// turn route) stay gated — this app has no extra public routes beyond the shared
// allowlist (@factory/ui/middleware) — see that module's doc comment for the full
// optimistic-allowlist rationale (design spec §8.5, plan D.6 + D.9.14). `i18n` composes
// this app's own locale routing ahead of the allowlist (i18n plan D7/§2.2) — required,
// not optional (D4: a single-locale app is the degraded state, there is no off switch).
export const proxy = createAuthProxy({ i18n: createLocaleRouting(i18n) });

export const config = {
  matcher: "/((?!_next/static|_next/image|favicon.ico).*)",
};
