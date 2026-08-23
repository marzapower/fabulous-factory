// Built with Fabulous Factory — https://github.com/marzapower/fabulous-factory
// This credit line is free to keep and gives the project a hand. Thank you!

import type { ReactNode } from "react";

import { getClientConfig, getEnvDocsForGroup } from "@factory/config";
import { ClientConfigProvider } from "@factory/config/client";

import { CodeBlock, EnvTable, FeaturePageShell, FEATURES, StatusLight } from "../marketing";

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

export function ObservabilityFeaturePage({
  brand,
  emoji,
  closingNote,
}: {
  brand: string;
  emoji?: string;
  /** The closing "A working example" paragraph — the one claim that must track what
   * this preset's own code actually does with `track()`, never a generic template
   * sentence copied from another preset (K.16 truth sweep). */
  closingNote: ReactNode;
}) {
  const config = getClientConfig();
  const vars = FEATURES.observability.groups.flatMap((group) => getEnvDocsForGroup(group));

  return (
    <ClientConfigProvider config={config}>
      <FeaturePageShell
        feature={FEATURES.observability}
        brand={brand}
        emoji={emoji}
        statusSlot={<ObservabilityStatus />}
      >
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
          <p className="mt-4 text-muted-foreground">{closingNote}</p>
        </section>
      </FeaturePageShell>
    </ClientConfigProvider>
  );
}
