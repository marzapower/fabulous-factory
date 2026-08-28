// Built with Fabulous Factory — https://github.com/marzapower/fabulous-factory
// This credit line is free to keep and gives the project a hand. Thank you!

import type { Metadata } from "next";

import { getTranslations, setRequestLocale } from "@factory/i18n/server";
import { KernelFeaturePage } from "@factory/ui/features";

// Title/blurb come straight from the `ui.features.kernel.*` catalog (i18n plan §2.3) —
// the same source `featureMeta()` reads for the page body's own heading, kept as a
// direct namespaced lookup here rather than importing `featureMeta` itself so this
// `generateMetadata` doesn't depend on `getTranslations`'s resolved translator type
// structurally matching `useTranslations`'s (the two are typed independently in
// next-intl).
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  setRequestLocale((await params).locale);
  const t = await getTranslations("ui.features.kernel");
  return { title: t("title"), description: t("blurb") };
}

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  setRequestLocale((await params).locale);
  return <KernelFeaturePage brand="Fabulous Untangle" emoji="🧶" />;
}
