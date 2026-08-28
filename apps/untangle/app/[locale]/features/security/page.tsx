// Built with Fabulous Factory — https://github.com/marzapower/fabulous-factory
// This credit line is free to keep and gives the project a hand. Thank you!

import type { Metadata } from "next";

import { getTranslations, setRequestLocale } from "@factory/i18n/server";
import { SecurityFeaturePage } from "@factory/ui/features";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  setRequestLocale((await params).locale);
  const t = await getTranslations("ui.features.security");
  return { title: t("title"), description: t("blurb") };
}

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  setRequestLocale((await params).locale);
  return <SecurityFeaturePage brand="Fabulous Untangle" emoji="🧶" />;
}
