// Imports next-intl/middleware — consumed ONLY by packages/ui/src/middleware.ts (the
// proxy, a guarded zone). Not imported by ./index.ts, ./routing.ts, or any client subpath.
import createMiddleware from "next-intl/middleware";
import type { NextRequest, NextResponse } from "next/server";

import type { I18nConfig } from "./index";
import type { Locale, LocaleRouting } from "./routing";

export interface LocaleRoutingHandler extends LocaleRouting {
  /**
   * next-intl createMiddleware(routing) with localePrefix "as-needed", localeDetection
   * false, localeCookie false, alternateLinks true. Always returns a NextResponse (a
   * rewrite to "/<locale>/..." carried via the `x-middleware-rewrite` header, or a
   * redirect) — never `undefined`.
   */
  handle(request: NextRequest): NextResponse;
}

function resolveRouting(config: I18nConfig | LocaleRouting): LocaleRouting {
  return "routing" in config ? config.routing : config;
}

export function createLocaleRouting(config: I18nConfig | LocaleRouting): LocaleRoutingHandler {
  const routing = resolveRouting(config);
  const [firstLocale, ...restLocales] = routing.locales;
  if (firstLocale === undefined) {
    throw new RangeError("createLocaleRouting: routing.locales must declare at least one locale.");
  }

  const handle = createMiddleware({
    locales: [firstLocale, ...restLocales] as [Locale, ...Locale[]],
    defaultLocale: routing.defaultLocale,
    localePrefix: "as-needed",
    localeDetection: false,
    localeCookie: false,
    // next-intl builds the hreflang `Link` header (D8) from the request's effective host
    // and protocol, which it derives from `x-forwarded-host`/`x-forwarded-proto` when
    // present (falling back to the request URL otherwise). Those headers are normally
    // set — and any inbound copy from the actual client stripped — by a trusted reverse
    // proxy in front of the app (Vercel, Fly, nginx, …), never by the browser directly;
    // this package assumes that deployment norm and performs no validation of its own on
    // the resulting header value. See docs/adr/0007-i18n-locale-prefix-routing.md.
    alternateLinks: true,
  });

  return {
    ...routing,
    handle: (request: NextRequest) => handle(request),
  };
}
