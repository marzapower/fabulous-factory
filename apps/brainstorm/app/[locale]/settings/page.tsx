import type { Metadata } from "next";

import { getTranslations, setRequestLocale } from "@factory/i18n/server";

import { AccountSettingsPage } from "@factory/ui/auth";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "app.meta.settings" });
  return { title: t("title"), description: t("description") };
}

// Capability-conditional UI must render dynamically (design spec §5.1), and this page's
// contents are gated on a live session lookup besides — never statically prerendered,
// same discipline as the dashboard page.
export const dynamic = "force-dynamic";

export default async function SettingsPage({ params }: { params: Promise<{ locale: string }> }) {
  setRequestLocale((await params).locale);
  return <AccountSettingsPage appName="Fabulous Brainstorm Chat" />;
}
