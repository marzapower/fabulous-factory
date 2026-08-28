// Built with Fabulous Factory — https://github.com/marzapower/fabulous-factory
// This credit line is free to keep and gives the project a hand. Thank you!

import type { Metadata } from "next";

import { getTranslations, setRequestLocale } from "@factory/i18n/server";

import { KernelFeaturePage } from "@factory/ui/features";
import { featureMeta } from "@factory/ui/marketing";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "ui.features" });
  const meta = featureMeta(t, "kernel");
  return { title: meta.title, description: meta.blurb };
}

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  setRequestLocale((await params).locale);
  return <KernelFeaturePage brand="Fabulous Brainstorm Chat" emoji="💭" />;
}
