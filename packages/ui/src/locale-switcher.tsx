// Built with Fabulous Factory — https://github.com/marzapower/fabulous-factory
// This credit line is free to keep and gives the project a hand. Thank you!

"use client";

import type { ChangeEvent } from "react";
import { Globe } from "lucide-react";

import { useLocale, useTranslations } from "@factory/i18n";
import { setLocaleCookie, useI18nRouting } from "@factory/i18n/client";
import { usePathname } from "@factory/i18n/navigation";
import { localizeHref } from "@factory/i18n/routing";

import { cn } from "./lib/utils";

/**
 * A footer utility control, not a call to action — deliberately unstyled as a "button"
 * (no border/background at rest, matching the quiet register of the Terms/Privacy links
 * beside it) and gains the same focus/hover affordance as everything else in the footer.
 * A native `<select>` keeps this accessible for free (keyboard, screen readers, mobile
 * pickers) without a new primitive or a floating-menu dependency.
 *
 * Hidden entirely — not disabled, not rendered as a single-option dropdown — when the
 * app declares only one locale (D8): a switcher with nothing to switch to is not a
 * degraded state worth showing.
 */
export function LocaleSwitcher() {
  const t = useTranslations("ui.localeSwitcher");
  const routing = useI18nRouting();
  const currentLocale = useLocale();
  const pathname = usePathname();

  if (routing.locales.length < 2) {
    return null;
  }

  function handleChange(event: ChangeEvent<HTMLSelectElement>) {
    const next = event.target.value;
    setLocaleCookie(routing, next);
    // A client-side (soft) navigation re-renders the root layout in place, since it
    // lives at `app/[locale]/layout.tsx` and a locale switch changes that very segment.
    // The root layout renders `<ThemeScript />` (packages/ui/src/theme/theme-script.tsx),
    // an inline `<script>` tag — React only allows those on the very first render of a
    // tree, so a soft re-render of the root layout logs "Encountered a script tag while
    // rendering React component". A full navigation (new document) sidesteps that
    // entirely, so this must be `window.location.assign`, never the i18n router.
    const target = localizeHref(routing, next, pathname) + window.location.search;
    window.location.assign(target);
  }

  return (
    <div className="relative inline-flex items-center">
      <Globe
        aria-hidden="true"
        className="pointer-events-none absolute left-2 size-3.5 text-muted-foreground"
      />
      <select
        aria-label={t("label")}
        onChange={handleChange}
        value={currentLocale}
        className={cn(
          "appearance-none rounded-md border border-transparent bg-transparent py-1 pr-2 pl-6 text-sm text-muted-foreground outline-none transition-colors",
          "hover:border-border hover:text-foreground",
          "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
        )}
      >
        {routing.locales.map((locale) => (
          <option key={locale} value={locale} className="bg-background text-foreground">
            {locale.toUpperCase()}
          </option>
        ))}
      </select>
    </div>
  );
}
