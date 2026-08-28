// Built with Fabulous Factory — https://github.com/marzapower/fabulous-factory
// This credit line is free to keep and gives the project a hand. Thank you!

import type { Metadata } from "next";

import { getTranslations, setRequestLocale } from "@factory/i18n/server";
import { ConfigFeaturePage } from "@factory/ui/features";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  setRequestLocale((await params).locale);
  const t = await getTranslations("ui.features.config");
  return { title: t("title"), description: t("blurb") };
}

// Capability-conditional UI (design spec §5.1) — the capability map below reads a
// runtime fact, never baked into a static build.
export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  setRequestLocale((await params).locale);
  return <ConfigFeaturePage brand="Fabulous Untangle" emoji="🧶" />;
}
