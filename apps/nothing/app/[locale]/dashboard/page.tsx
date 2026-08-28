import { requireSession } from "@factory/auth";
import { getClientConfig } from "@factory/config";
import { ClientConfigProvider } from "@factory/config/client";
import { getTranslations, localizedHref, setRequestLocale } from "@factory/i18n/server";

import { DashboardTopBar } from "@factory/ui/dashboard";
import { SiteFooter } from "@factory/ui/marketing";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@factory/ui/primitives";
import { CapabilityPanel } from "@factory/ui/capability-panel";

// Capability-conditional UI must render dynamically (design spec §5.1), and this page's
// contents are gated on a live session lookup besides — never statically prerendered.
export const dynamic = "force-dynamic";

export default async function DashboardPage({ params }: { params: Promise<{ locale: string }> }) {
  setRequestLocale((await params).locale);
  const t = await getTranslations("app.dashboard");
  // packages/auth is untouched by this migration — requireSession keeps its bare
  // "/login" default; this page passes a localized redirectTo instead. The proxy
  // handles the localized bounce first (see proxy.ts) — this is defense-in-depth.
  const session = await requireSession({ redirectTo: await localizedHref("/login") });
  const config = getClientConfig();

  return (
    <ClientConfigProvider config={config}>
      <div className="fab-shell flex min-h-svh flex-col">
        <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-6 py-12">
          <Card>
            <CardHeader>
              <CardTitle className="text-xl">{t("signedInTitle")}</CardTitle>
              <CardDescription>{session.user.email}</CardDescription>
            </CardHeader>
            <CardContent className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {session.user.name
                  ? t("welcomeWithName", { name: session.user.name })
                  : t("welcomeNoName")}
              </p>
              <DashboardTopBar userEmail={session.user.email} settingsHref="/settings" />
            </CardContent>
          </Card>

          <CapabilityPanel />

          {/* Empty-state as invitation, not apology (design mandate: "the honest blank").
              No BillingCard, no jobs notice — this preset ships neither. */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">{t("title")}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <p className="text-sm text-muted-foreground">{t("emptyLine1")}</p>
              <p className="text-sm text-muted-foreground">
                {t.rich("emptyLine2", {
                  code: (chunks) => (
                    <code className="rounded-sm bg-muted px-1 py-0.5 font-mono text-foreground">
                      {chunks}
                    </code>
                  ),
                })}
              </p>
            </CardContent>
          </Card>
        </main>

        <SiteFooter />
      </div>
    </ClientConfigProvider>
  );
}
