import { AnalyticsProvider } from "@factory/analytics/client";
import { requireSession } from "@factory/auth";
import { getEntitlement } from "@factory/billing";
import { getClientConfig, isEnabled } from "@factory/config";
import { ClientConfigProvider } from "@factory/config/client";
import {
  countRunsToday,
  getLatestRunForUserByKind,
  listOpenTasksForUser,
  listTasksForUser,
} from "@factory/untangle";

import { DashboardTopBar } from "@factory/ui/dashboard";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@factory/ui/primitives";
import { BillingCard } from "@/components/billing/billing-card";
import { TodaysPlan } from "@/components/dashboard/todays-plan";
import { Workspace } from "@/components/workspace/workspace";
import { SiteFooter } from "@factory/ui/marketing";
import { CapabilityPanel } from "@factory/ui/capability-panel";

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
  const jobsEnabled = isEnabled("jobs");

  const [tasks, runsToday, entitlement, latestPlanRunRow, openTasks] = await Promise.all([
    listTasksForUser(session.user.id),
    countRunsToday(session.user.id, "capture"),
    getEntitlement(session.user.id),
    // Both daily-plan reads are skipped outright when `jobs` is off — there is no cron,
    // so there is nothing to find, and the widget never needs this data in that state.
    jobsEnabled ? getLatestRunForUserByKind(session.user.id, "daily-plan") : null,
    jobsEnabled ? listOpenTasksForUser(session.user.id) : [],
  ]);
  // `getLatestRunForUserByKind` resolves `undefined` (no such run yet), never `null` —
  // normalized here so `TodaysPlan`'s prop stays a plain `T | null` rather than also
  // having to account for `undefined`.
  const latestPlanRun = latestPlanRunRow ?? null;

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
              <DashboardTopBar userEmail={session.user.email} settingsHref="/settings" />
            </CardContent>
          </Card>

          {/* Billing card is mounted ONLY when billing is enabled — with billing
              disabled there must be zero billing UI. */}
          {isEnabled("billing") && <BillingCard entitlement={entitlement} runCount={runsToday} />}

          {/* "Today's plan" (T8) — the in-app surface for the daily-plan feature, which
              previously only existed as an email. Renders its own honest state for all
              three cases (jobs off / jobs on with no run yet / jobs on with a plan run) —
              see `TodaysPlan`'s own doc comment. */}
          <TodaysPlan jobsEnabled={jobsEnabled} latestRun={latestPlanRun} openTasks={openTasks} />

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
