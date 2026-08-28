// Built with Fabulous Factory — https://github.com/marzapower/fabulous-factory
// This credit line is free to keep and gives the project a hand. Thank you!

import type { Metadata } from "next";

import { getTranslations, setRequestLocale } from "@factory/i18n/server";

import { BillingFeaturePage } from "@factory/ui/features";
import { featureMeta } from "@factory/ui/marketing";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  setRequestLocale((await params).locale);
  const t = await getTranslations("ui.features");
  const { title, blurb } = featureMeta(t, "billing");
  return { title, description: blurb };
}

// Capability-conditional UI (design spec §5.1) — the status light below reads a runtime
// fact, never baked into a static build.
export const dynamic = "force-dynamic";

const entitlementSnippet = `export async function getEntitlement(userId: string): Promise<Entitlement> {
  if (getCapabilities().billing === "disabled") {
    // Free mode: unlimited runs, never a paywall for a disabled service. Any per-day
    // abuse ceiling on top of that is your action layer's own call — @factory/billing
    // only resolves the entitlement, it never enforces usage itself.
    return freeEntitlement("disabled");
  }

  // Billing enabled reads ONLY the Postgres subscriptions cache — never the
  // provider API on this hot path.
  const [winner] = await db.select(...).from(schema.subscriptions)...;
  ...
}`;

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  setRequestLocale((await params).locale);
  const t = await getTranslations("app.features.billing");

  return (
    <BillingFeaturePage
      brand="Fabulous Nothing"
      entitlementSnippet={entitlementSnippet}
      exampleIntro={
        <>
          {t.rich("exampleIntro", {
            code: (chunks) => <code className="font-mono">{chunks}</code>,
          })}
        </>
      }
      exampleOutro={
        <>
          {t.rich("exampleOutro", {
            code: (chunks) => <code className="font-mono">{chunks}</code>,
          })}
        </>
      }
    />
  );
}
