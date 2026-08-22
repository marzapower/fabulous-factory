// Built with Fabulous Factory — https://github.com/marzapower/fabulous-factory
// This credit line is free to keep and gives the project a hand. Thank you!

import type { Metadata } from "next";

import { getClientConfig, getEnvDocsForGroup } from "@factory/config";
import { ClientConfigProvider } from "@factory/config/client";

import { CodeBlock } from "@/components/marketing/code-block";
import { EnvTable } from "@/components/marketing/env-table";
import { FeaturePageShell } from "@/components/marketing/feature-page-shell";
import { FEATURES } from "@/components/marketing/features-meta";
import { StatusLight } from "@/components/marketing/status-light";

export const metadata: Metadata = {
  title: FEATURES.observability.title,
  description: FEATURES.observability.blurb,
};

// Capability-conditional UI (design spec §5.1) — both status lights below read a runtime
// fact, never baked into a static build.
export const dynamic = "force-dynamic";

/** Two labeled lights, side by side — observability covers two independent
 * capabilities (analytics + errors), so one boolean can't speak for both. */
function ObservabilityStatus() {
  return (
    <div className="fab-status flex flex-wrap items-center gap-4">
      <div className="flex items-center gap-2">
        <span className="font-mono text-xs text-muted-foreground">analytics</span>
        <StatusLight service="analytics" />
      </div>
      <div className="flex items-center gap-2">
        <span className="font-mono text-xs text-muted-foreground">errors</span>
        <StatusLight service="errors" />
      </div>
    </div>
  );
}

const trackSnippet = `export function track(event: string, opts: TrackOptions): void {
  if (getCapabilities().analytics !== "posthog") return;

  const { distinctId, ...properties } = opts;
  // Fire-and-forget: never awaited, never rejects the caller's control flow.
  void getPostHogClient()
    .then((client) => client.capture({ distinctId, event, properties }))
    .catch((error) => console.error("[@factory/analytics] track failed:", error));
}`;

export default function ObservabilityFeaturePage() {
  const config = getClientConfig();
  const vars = FEATURES.observability.groups.flatMap((group) => getEnvDocsForGroup(group));

  return (
    <ClientConfigProvider config={config}>
      <FeaturePageShell feature={FEATURES.observability} statusSlot={<ObservabilityStatus />}>
        <section>
          <h2 className="text-xl font-semibold">What it does</h2>
          <p className="mt-2 text-muted-foreground">
            From a caller&rsquo;s side: <code className="font-mono">track()</code> fires an
            analytics event and <code className="font-mono">captureException()</code> reports an
            error — both are unconditional calls you never wrap in a capability check yourself.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold">The rule it enforces</h2>
          <p className="mt-2 text-muted-foreground">
            Two independent seams under one banner: product analytics via PostHog and error tracking
            via Sentry, plus OpenTelemetry tracing underneath the LLM and job pipelines. Either can
            be on, off, or both — neither depends on the other, and neither depends on any other
            service in the template. <code className="font-mono">track()</code> is fire-and-forget
            by contract: it never blocks the caller and never throws, whether analytics is on, off,
            or the call itself fails.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold">Real source</h2>
          <CodeBlock code={trackSnippet} caption="packages/analytics/src/track.ts — track()" />
        </section>

        <section>
          <h2 className="text-xl font-semibold">A working example</h2>
          <p className="mt-2 text-muted-foreground">
            Set <code className="font-mono">POSTHOG_KEY</code> for analytics and/or{" "}
            <code className="font-mono">SENTRY_DSN</code> for error reporting — each lights up
            independently. Leave either unset and its functions become silent no-ops: no vendor SDK
            is ever imported, and nothing that calls <code className="font-mono">track()</code> or{" "}
            <code className="font-mono">captureException()</code> changes behavior.
          </p>
          <div className="mt-4">
            <EnvTable vars={vars} />
          </div>
          <p className="mt-4 text-muted-foreground">
            Sign in and use the dashboard — untangling a dump emits analytics events under the hood.
            Unset both keys and try again: nothing breaks, the calls just quietly do nothing.
          </p>
        </section>
      </FeaturePageShell>
    </ClientConfigProvider>
  );
}
