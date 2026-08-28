"use client";

import NextLink from "next/link";
import { usePathname as useNextPathname, useRouter as useNextRouter } from "next/navigation";
import { forwardRef, type ComponentProps } from "react";

import { useLocale } from "./index";
import { useI18nRouting } from "./client";
import { localizeHref, stripLocale, type Locale } from "./routing";

// Wraps next/link + next/navigation directly — deliberately NOT next-intl's own
// createNavigation(), since the routing config here is app-owned (defineI18n(), per
// app) and reaches the client through I18nProvider context rather than a module built
// once at the package level.

/** `next/link`, with `href` localized by `props.locale ?? useLocale()`. `href` is typed
 *  `string` only — a `UrlObject` href can't be localized (`localizeHref` operates on a
 *  path string), so the type itself rules it out rather than silently passing it through
 *  unlocalized. */
export const Link = forwardRef<
  HTMLAnchorElement,
  Omit<ComponentProps<typeof NextLink>, "href"> & { href: string; locale?: Locale }
>(function Link({ href, locale, ...props }, ref) {
  const routing = useI18nRouting();
  const currentLocale = useLocale();
  const resolvedHref = localizeHref(routing, locale ?? currentLocale, href);
  return <NextLink ref={ref} href={resolvedHref} {...props} />;
});

export interface I18nRouter {
  push(href: string, opts?: { locale?: Locale; scroll?: boolean }): void;
  replace(href: string, opts?: { locale?: Locale; scroll?: boolean }): void;
  prefetch(href: string, opts?: { locale?: Locale }): void;
  back(): void;
  forward(): void;
  refresh(): void;
}

/** `next/navigation`'s router, with every href-taking method localized by
 *  `opts.locale ?? useLocale()`. */
export function useRouter(): I18nRouter {
  const routing = useI18nRouting();
  const currentLocale = useLocale();
  const router = useNextRouter();

  return {
    push(href, opts) {
      router.push(localizeHref(routing, opts?.locale ?? currentLocale, href), {
        scroll: opts?.scroll,
      });
    },
    replace(href, opts) {
      router.replace(localizeHref(routing, opts?.locale ?? currentLocale, href), {
        scroll: opts?.scroll,
      });
    },
    prefetch(href, opts) {
      router.prefetch(localizeHref(routing, opts?.locale ?? currentLocale, href));
    },
    back() {
      router.back();
    },
    forward() {
      router.forward();
    },
    refresh() {
      router.refresh();
    },
  };
}

/** `next/navigation`'s pathname, with the locale prefix stripped. */
export function usePathname(): string {
  const routing = useI18nRouting();
  const pathname = useNextPathname();
  return stripLocale(routing, pathname ?? "/").pathname;
}
