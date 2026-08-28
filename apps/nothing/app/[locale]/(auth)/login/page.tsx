import type { Metadata } from "next";

import { getCapabilities, getEnv } from "@factory/config";
import { deriveAuthOptions } from "@factory/auth";
import { getTranslations, setRequestLocale } from "@factory/i18n/server";
import { Link } from "@factory/i18n/navigation";
import { LoginForm } from "@factory/ui/auth";
import { SiteFooter } from "@factory/ui/marketing";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@factory/ui/primitives";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  setRequestLocale((await params).locale);
  const t = await getTranslations("app.meta.login");
  return { title: t("title"), description: t("description") };
}

// OAuth button visibility is a runtime, server-side fact (which providers have both
// client id + secret configured) — never guessed client-side (design spec §5.1).
export const dynamic = "force-dynamic";

export default async function LoginPage({ params }: { params: Promise<{ locale: string }> }) {
  setRequestLocale((await params).locale);
  const t = await getTranslations("app.auth.login");
  const { enabledProviders, email } = deriveAuthOptions(getEnv(), getCapabilities());

  return (
    <div className="fab-shell flex min-h-svh flex-col">
      <main className="flex flex-1 items-center justify-center p-6">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle className="text-xl">{t("heading")}</CardTitle>
            <CardDescription>{t("subheading")}</CardDescription>
          </CardHeader>
          <CardContent>
            <LoginForm enabledProviders={enabledProviders} magicLinkEnabled={email.magicLink} />
            <p className="mt-6 text-center text-sm text-muted-foreground">
              {t("noAccount")}{" "}
              <Link href="/signup" className="underline underline-offset-4">
                {t("signUp")}
              </Link>
            </p>
          </CardContent>
        </Card>
      </main>

      <SiteFooter />
    </div>
  );
}
