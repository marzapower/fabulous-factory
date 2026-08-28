import type { Metadata } from "next";
import localFont from "next/font/local";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { hasLocale, NextIntlClientProvider } from "@factory/i18n";
import { I18nProvider } from "@factory/i18n/client";
import { generateLocaleParams, getTranslations, setRequestLocale } from "@factory/i18n/server";

import { ThemeScript } from "@factory/ui/theme";

import { i18n } from "../../i18n/config";

import "../globals.css";

// Convention (see docs/superpowers/plans §B.4): the root layout stays config-free.
// Next statically prerenders /_not-found at build time, and that render includes the
// root layout — a getClientConfig() call here would freeze build-machine capabilities
// into static HTML, violating design spec §5.1. Config reads live only in force-dynamic
// pages (see app/[locale]/page.tsx). Importing global (Tailwind) styles is static CSS,
// not config, and is fine here. next/font/local is build-time static too (the files are
// vendored in ../fonts, resolved and self-hosted at build time, no network fetch, no
// config), so it's legal here for the same reason. Reading the request locale via
// `setRequestLocale`/`hasLocale` below is also static — it comes from
// `generateStaticParams` at build time for every declared locale, not a runtime config
// read.
const plexSans = localFont({
  src: [
    { path: "../fonts/ibm-plex-sans-400.woff2", weight: "400", style: "normal" },
    { path: "../fonts/ibm-plex-sans-600.woff2", weight: "600", style: "normal" },
    { path: "../fonts/ibm-plex-sans-700.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-plex-sans",
  display: "swap",
});

const plexMono = localFont({
  src: [
    { path: "../fonts/ibm-plex-mono-400.woff2", weight: "400", style: "normal" },
    { path: "../fonts/ibm-plex-mono-500.woff2", weight: "500", style: "normal" },
  ],
  variable: "--font-plex-mono",
  display: "swap",
});

// One static param per declared locale (i18n plan §2.3) — untangle declares `["en"]`
// only (D6), so this is a single-entry list today; `dynamicParams = false` below makes
// any other locale segment 404 instead of rendering on demand.
export function generateStaticParams() {
  return generateLocaleParams(i18n);
}

export const dynamicParams = false;

/**
 * The PRODUCT's metadata, not the template's — `/` is Untangle's landing page and the
 * browser tab has to agree with it, or the demo stops being a demo. The template gets
 * its own title on `/features`, and `make-it-yours` points an adopter here as one of the
 * strings to rename.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("app.meta.home");

  return {
    title: {
      default: t("title"),
      template: t("template"),
    },
    description: t("description"),
  };
}

export default async function RootLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(i18n.locales, locale)) {
    notFound();
  }
  setRequestLocale(locale);

  return (
    // suppressHydrationWarning: ThemeScript below mutates the class list before
    // hydration runs, so the server-rendered class list and the first client render
    // legitimately disagree on `dark` — that's the point, not a bug to silence away.
    <html
      lang={locale}
      className={`${plexSans.variable} ${plexMono.variable}`}
      suppressHydrationWarning
    >
      <body className="min-h-svh bg-background font-sans text-foreground antialiased">
        {/* Static client boilerplate, same as next/font/local above — no config read,
            so it stays legal in this config-free root layout (see the note up top). */}
        <ThemeScript />
        {/* No explicit locale/messages props — both are inferred from the request
            config (i18n/request.ts) that `setRequestLocale` above already resolved for
            this render (i18n plan §2.3). `I18nProvider` carries only the routing shape
            (locales/defaultLocale/cookieName) so `@factory/i18n/navigation` and the
            locale switcher can localize hrefs without threading it through every page. */}
        <NextIntlClientProvider>
          <I18nProvider routing={i18n.routing}>{children}</I18nProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
