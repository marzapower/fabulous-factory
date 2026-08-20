import { AnalyticsProvider } from "@factory/analytics/client";
import { requireSession } from "@factory/auth";
import { getClientConfig } from "@factory/config";
import { ClientConfigProvider } from "@factory/config/client";

import { SignOutButton } from "@/components/auth/sign-out-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CapabilityPanel } from "../capability-panel";

// Capability-conditional UI must render dynamically (design spec §5.1), and this page's
// contents are gated on a live session lookup besides — never statically prerendered.
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await requireSession({ redirectTo: "/login" });
  const config = getClientConfig();

  return (
    <ClientConfigProvider config={config}>
      {/* AnalyticsProvider bootstraps posthog-js from the server-resolved client config
          (no-op when analytics is disabled) and tracks pageviews — mounted inside a
          force-dynamic, ClientConfigProvider subtree per spec §5.1. Adopters extend this
          to more of the app via a shared dynamic layout; the demo (M6) adds event
          call sites. */}
      <AnalyticsProvider>
        <main className="mx-auto flex min-h-svh max-w-2xl flex-col gap-6 p-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-xl">Dashboard</CardTitle>
              <CardDescription>Signed in as {session.user.email}</CardDescription>
            </CardHeader>
            <CardContent className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Welcome{session.user.name ? `, ${session.user.name}` : ""}.
              </p>
              <SignOutButton />
            </CardContent>
          </Card>

          <CapabilityPanel />
        </main>
      </AnalyticsProvider>
    </ClientConfigProvider>
  );
}
