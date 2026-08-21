import { AnalyticsProvider } from "@factory/analytics/client";
import { requireSession } from "@factory/auth";
import { getEntitlement } from "@factory/billing";
import { getClientConfig, isEnabled } from "@factory/config";
import { ClientConfigProvider } from "@factory/config/client";
import { listMonitorsForUser, listRecentEventsForUser } from "@factory/jobs";

import { SignOutButton } from "@/components/auth/sign-out-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BillingCard } from "@/components/billing/billing-card";
import { MonitorsCard } from "@/components/demo/monitors-card";
import { FeedCard } from "@/components/demo/feed-card";
import { CapabilityPanel } from "../capability-panel";

// Capability-conditional UI must render dynamically (design spec §5.1), and this page's
// contents are gated on a live session lookup besides — never statically prerendered.
export const dynamic = "force-dynamic";

const FEED_LIMIT = 20;

export default async function DashboardPage() {
  const session = await requireSession({ redirectTo: "/login" });
  const config = getClientConfig();

  // Entitlement is fetched ONCE here, server-side, and threaded to both cards below
  // (m7-billing.md H.2.3) — `getEntitlement` itself resolves `monitorLimit: null` when
  // billing is disabled (unlimited, still subject to `MONITOR_HARD_CEILING`), so
  // `MonitorsCard`'s cap stays correct in every profile without this page branching on
  // `isEnabled("billing")` itself; only the billing card's mount below does.
  const [monitors, events, entitlement] = await Promise.all([
    listMonitorsForUser(session.user.id),
    listRecentEventsForUser(session.user.id, FEED_LIMIT),
    getEntitlement(session.user.id),
  ]);

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

          {/* Billing card is mounted ONLY when billing is enabled (m7-billing.md H.0
              exit criterion) — with billing disabled there must be zero billing UI. */}
          {isEnabled("billing") && (
            <BillingCard entitlement={entitlement} monitorCount={monitors.length} />
          )}

          <MonitorsCard
            monitors={monitors}
            monitorLimit={entitlement.monitorLimit}
            jobsEnabled={isEnabled("jobs")}
          />

          <FeedCard
            events={events.map((event) => ({
              id: event.id,
              monitorName: event.monitorName,
              kind: event.kind,
              summary: event.summary,
              createdAt: event.createdAt,
            }))}
          />

          <CapabilityPanel />
        </main>
      </AnalyticsProvider>
    </ClientConfigProvider>
  );
}
