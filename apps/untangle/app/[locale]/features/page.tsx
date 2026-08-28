// Built with Fabulous Factory — https://github.com/marzapower/fabulous-factory
// This credit line is free to keep and gives the project a hand. Thank you!

import type { Metadata } from "next";

import { getTranslations, setRequestLocale } from "@factory/i18n/server";
import { FeaturesIndexShell } from "@factory/ui/features";
import { DegradationStrip } from "@/components/marketing/degradation-strip";

// This page is about the template, not the product, so it overrides the product title
// the root layout sets for every other route.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  setRequestLocale((await params).locale);
  const t = await getTranslations("app.meta.featuresIndex");
  return {
    // `absolute` so the root layout's "%s · Untangle" template doesn't append the
    // product name to a page that is explicitly about the template rather than the
    // product.
    title: { absolute: t("title") },
    description: t("description"),
  };
}

// Capability-conditional UI must render dynamically (design spec §5.1): capabilities are
// a runtime, server-side fact resolved at request time, never baked into a static build.
export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  setRequestLocale((await params).locale);
  return (
    <FeaturesIndexShell
      brand="Fabulous Untangle"
      emoji="🧶"
      heroParagraph={
        <>
          Untangle is the sample product that ships with Fabulous Factory — scaffolded with one npx
          command, not cloned from a template. This page is about the factory.
        </>
      }
      degradationStrip={<DegradationStrip />}
    />
  );
}
