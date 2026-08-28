import type { Metadata } from "next";

import { getCapabilities, getEnv } from "@factory/config";
import { deriveAuthOptions } from "@factory/auth";
import { Link } from "@factory/i18n/navigation";
import { getTranslations, setRequestLocale } from "@factory/i18n/server";
import { SignupForm } from "@factory/ui/auth";
import { SiteFooter } from "@factory/ui/marketing";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@factory/ui/primitives";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  setRequestLocale((await params).locale);
  const t = await getTranslations("app.meta.signup");
  return { title: t("title"), description: t("description") };
}

// OAuth button visibility is a runtime, server-side fact (which providers have both
// client id + secret configured) — never guessed client-side (design spec §5.1).
export const dynamic = "force-dynamic";

export default async function SignupPage({ params }: { params: Promise<{ locale: string }> }) {
  setRequestLocale((await params).locale);
  // getTranslations, not useTranslations: this default export is an async Server
  // Component, and next-intl's sync hook is only callable from a non-async component
  // (https://next-intl.dev/docs/environments/server-client-components#async-components).
  const t = await getTranslations("app.auth.signupPage");
  const { enabledProviders } = deriveAuthOptions(getEnv(), getCapabilities());

  return (
    <div className="fab-shell flex min-h-svh flex-col">
      <main className="flex flex-1 items-center justify-center p-6">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle className="text-xl">{t("title")}</CardTitle>
            <CardDescription>{t("description")}</CardDescription>
          </CardHeader>
          <CardContent>
            <SignupForm enabledProviders={enabledProviders} />
            <p className="mt-6 text-center text-sm text-muted-foreground">
              {t("haveAccount")}{" "}
              <Link href="/login" className="underline underline-offset-4">
                {t("signIn")}
              </Link>
            </p>
          </CardContent>
        </Card>
      </main>

      <SiteFooter />
    </div>
  );
}
