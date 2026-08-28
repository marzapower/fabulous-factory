// Built with Fabulous Factory — https://github.com/marzapower/fabulous-factory
// This credit line is free to keep and gives the project a hand. Thank you!

import type { Metadata } from "next";

import { getTranslations, setRequestLocale } from "@factory/i18n/server";

import { ObservabilityFeaturePage } from "@factory/ui/features";
import { featureMeta } from "@factory/ui/marketing";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  setRequestLocale((await params).locale);
  const t = await getTranslations("ui.features");
  const { title, blurb } = featureMeta(t, "observability");
  return { title, description: blurb };
}

// Capability-conditional UI (design spec §5.1) — both status lights below read a runtime
// fact, never baked into a static build.
export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  setRequestLocale((await params).locale);
  const t = await getTranslations("app.features.observability");

  return (
    <ObservabilityFeaturePage
      brand="Fabulous Nothing"
      closingNote={
        <>
          {t.rich("closingNote", {
            code: (chunks) => <code className="font-mono">{chunks}</code>,
          })}
        </>
      }
    />
  );
}
