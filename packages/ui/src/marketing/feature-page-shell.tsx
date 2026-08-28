// Built with Fabulous Factory — https://github.com/marzapower/fabulous-factory
// This credit line is free to keep and gives the project a hand. Thank you!

import type { ReactNode } from "react";

import { useTranslations } from "@factory/i18n";
import { Link } from "@factory/i18n/navigation";

import type { FeatureMeta } from "./features-meta";
import { SiteFooter } from "./site-footer";
import { SiteHeader } from "./site-header";

export function FeaturePageShell({
  feature,
  brand,
  emoji,
  statusSlot,
  children,
}: {
  feature: FeatureMeta;
  /** Forwarded to `SiteHeader` — see its props for the brand/emoji contract. */
  brand: string;
  emoji?: string;
  statusSlot?: ReactNode;
  children: ReactNode;
}) {
  const t = useTranslations("ui.marketing.featurePageShell");

  return (
    <div className="fab-page flex min-h-svh flex-col">
      <SiteHeader brand={brand} emoji={emoji} />

      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-12">
        <nav
          aria-label={t("breadcrumbNavLabel")}
          className="mb-6 flex gap-2 text-sm text-muted-foreground"
        >
          <Link href="/" className="hover:text-foreground">
            {t("breadcrumbHome")}
          </Link>
          <span aria-hidden="true">/</span>
          <Link href="/#features" className="hover:text-foreground">
            {t("breadcrumbFeatures")}
          </Link>
          <span aria-hidden="true">/</span>
          <span className="text-foreground">{feature.title}</span>
        </nav>

        <h1 className="text-3xl font-bold tracking-tight text-foreground">{feature.title}</h1>
        <p className="mt-2 text-lg text-muted-foreground">{feature.blurb}</p>

        {statusSlot ? <div className="mt-6">{statusSlot}</div> : null}

        <article className="mt-10 flex flex-col gap-6 text-foreground">{children}</article>
      </main>

      <SiteFooter />
    </div>
  );
}
