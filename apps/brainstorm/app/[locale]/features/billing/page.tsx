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
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "ui.features" });
  const meta = featureMeta(t, "billing");
  return { title: meta.title, description: meta.blurb };
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

// K.16 truth sweep: this preset has no billing UI and no "runs" — untangle's dashboard
// billing card and daily run limit don't exist here. Copy is the "nothing" preset's
// (also billing-UI-less) closing paragraph, adjusted for brainstorm's board/chat surface.
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  setRequestLocale((await params).locale);

  return (
    <BillingFeaturePage
      brand="Fabulous Brainstorm Chat"
      emoji="💭"
      entitlementSnippet={entitlementSnippet}
      exampleIntro={
        <>
          Set both Stripe keys and checkout and webhooks switch on together. Leave them unset and
          every account gets <code className="font-mono">runsPerDay: null</code> — unlimited,
          subject only to the fixed, per-day abuse ceiling every profile enforces.
        </>
      }
      exampleOutro={
        <>
          This preset ships no billing UI yet — <code className="font-mono">getEntitlement()</code>{" "}
          is the one call a paywalled feature would check for a plan limit; nothing on the board or
          in chat calls it today. With Stripe configured, an upgrade raises that limit the moment
          the webhook lands.
        </>
      }
    />
  );
}
