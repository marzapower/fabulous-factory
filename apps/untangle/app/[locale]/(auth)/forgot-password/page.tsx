import type { Metadata } from "next";

import { getTranslations, setRequestLocale } from "@factory/i18n/server";
import { ForgotPasswordPage } from "@factory/ui/auth";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  setRequestLocale((await params).locale);
  const t = await getTranslations("app.meta.forgotPassword");
  return { title: t("title"), description: t("description") };
}

// Capability-conditional UI (emailEnabled) must render dynamically (design spec §5.1) —
// never guessed client-side, same discipline as the login/signup pages' provider list.
export const dynamic = "force-dynamic";

export default async function ForgotPasswordRoutePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  setRequestLocale((await params).locale);
  return <ForgotPasswordPage appName="Untangle" />;
}
