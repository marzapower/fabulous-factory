import { AnalyticsProvider } from "@factory/analytics/client";
import { requireSession } from "@factory/auth";
import { getEntitlement } from "@factory/billing";
import { getClientConfig, isEnabled } from "@factory/config";
import { ClientConfigProvider } from "@factory/config/client";
import { countRunsToday, listTasksForUser } from "@factory/untangle";

import { SignOutButton } from "@/components/auth/sign-out-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BillingCard } from "@/components/billing/billing-card";
import { Workspace } from "@/components/workspace/workspace";
import { SiteFooter } from "@/components/marketing/site-footer";
import { CapabilityPanel } from "../capability-panel";

// Capability-conditional UI must render dynamically (design spec §5.1), and this page's
// contents are gated on a live session lookup besides — never statically prerendered.
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await requireSession({ redirectTo: "/login" });
  const config = getClientConfig();

  // Entitlement fetched ONCE here, server-side (m11-untangle-workspace.md K.7 mirrors
  // m7-billing.md H.2.3's shape): `getEntitlement` resolves `runsPerDay: null` when
  // billing is disabled — unlimited, subject only to `RUN_HARD_CEILING_PER_DAY` inside
  // `packages/jobs` — so the workspace's usage line stays correct in every profile
  // without this page branching on `isEnabled("billing")` itself; only the billing
  // card's mount below does that.
  const [tasks, runsToday, entitlement] = await Promise.all([
    listTasksForUser(session.user.id),
    countRunsToday(session.user.id, "capture"),
    getEntitlement(session.user.id),
  ]);

  return (
    <ClientConfigProvider config={config}>
      {/* AnalyticsProvider bootstraps posthog-js from the server-resolved client config
          (no-op when analytics is disabled) and tracks pageviews — mounted inside a
          force-dynamic, ClientConfigProvider subtree per spec §5.1. */}
      <AnalyticsProvider>
        <main className="fab-shell mx-auto flex min-h-svh max-w-2xl flex-col gap-6 p-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-xl">Untangle</CardTitle>
              <CardDescription>Signed in as {session.user.email}</CardDescription>
            </CardHeader>
            <CardContent className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Welcome{session.user.name ? `, ${session.user.name}` : ""}.
              </p>
              <SignOutButton />
            </CardContent>
          </Card>

          {/* Billing card is mounted ONLY when billing is enabled — with billing
              disabled there must be zero billing UI. */}
          {isEnabled("billing") && <BillingCard entitlement={entitlement} runCount={runsToday} />}

          {/* Degradation is visible, not hidden (K.10): with `jobs` off there is no
              daily plan and no cron — this says so plainly rather than rendering a
              dead control. Interactive runs are unaffected either way; they were
              always inline (K.1.6). */}
          {!isEnabled("jobs") && (
            <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
              Daily plan is off in this deployment — turn on the{" "}
              <code className="font-mono">jobs</code> capability for a morning summary of what
              matters today. Untangling on demand works exactly the same either way.
            </p>
          )}

          <Workspace
            initialTasks={tasks}
            runsToday={runsToday}
            runsPerDay={entitlement.runsPerDay}
          />

          <CapabilityPanel />
        </main>

        <SiteFooter />
      </AnalyticsProvider>
    </ClientConfigProvider>
  );
}
