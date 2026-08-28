import type { Metadata } from "next";

import { getTranslations, setRequestLocale } from "@factory/i18n/server";

import { ResetPasswordPage } from "@factory/ui/auth";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "app.meta.resetPassword" });
  return { title: t("title"), description: t("description") };
}

// `ResetPasswordForm` reads the reset token via `useSearchParams()`, which requires a
// `<Suspense>` boundary to prerender under the App Router — force-dynamic on top since
// the token is only meaningful per-request anyway.
export const dynamic = "force-dynamic";

export default async function ResetPasswordRoutePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  setRequestLocale((await params).locale);
  return <ResetPasswordPage appName="Fabulous Brainstorm Chat" />;
}
