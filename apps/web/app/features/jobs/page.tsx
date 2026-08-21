// Built with Fabulous Factory — https://github.com/marzapower/fabulous-factory
// This credit line is free to keep and gives the project a hand. Thank you!

import { getClientConfig, getEnvDocsForGroup } from "@factory/config";
import { ClientConfigProvider } from "@factory/config/client";

import { CodeBlock } from "@/components/marketing/code-block";
import { EnvTable } from "@/components/marketing/env-table";
import { FeaturePageShell } from "@/components/marketing/feature-page-shell";
import { FEATURES } from "@/components/marketing/features-meta";
import { StatusLight } from "@/components/marketing/status-light";

// Capability-conditional UI (design spec §5.1) — the status light below reads a runtime
// fact, never baked into a static build.
export const dynamic = "force-dynamic";

const cronSnippet = `export const monitorCron = inngest.createFunction(
  { id: "monitor-cron", triggers: [{ cron: "*/15 * * * *" }] },
  async ({ step }) => {
    const monitorIds = await step.run("list-monitors", async () => {
      const rows = await getDb().select({ id: schema.monitors.id }).from(schema.monitors);
      return rows.map((row) => row.id);
    });

    // One event per monitor — a bad URL can't fail the whole batch. Chunked above
    // FAN_OUT_CHUNK_SIZE monitors so a single step.sendEvent payload never grows
    // unbounded with the fleet size.
    for (const [index, idChunk] of chunk(monitorIds, FAN_OUT_CHUNK_SIZE).entries()) {
      await step.sendEvent(
        \`fan-out-checks-\${index}\`,
        idChunk.map((monitorId) => ({ name: MONITOR_CHECK_EVENT, data: { monitorId } })),
      );
    }
  },
);`;

export default function JobsFeaturePage() {
  const config = getClientConfig();
  const vars = FEATURES.jobs.groups.flatMap((group) => getEnvDocsForGroup(group));

  return (
    <ClientConfigProvider config={config}>
      <FeaturePageShell feature={FEATURES.jobs} statusSlot={<StatusLight service="jobs" />}>
        <section>
          <h2 className="text-xl font-semibold">What you get</h2>
          <p className="mt-2 text-muted-foreground">
            Inngest step functions for cron and fan-out, with retries and per-item failure isolation
            built in — one bad URL never takes down a whole batch run. The demo monitor cron ticks
            every 15 minutes and fans out one check per monitor, each with its own retry budget and
            failure handling.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold">How it works here</h2>
          <p className="mt-2 text-muted-foreground">
            The cron function only lists work and fans it out — the actual check runs in a separate
            worker function, so a single monitor&rsquo;s retries never block the next scheduled tick
            from firing.
          </p>
          <CodeBlock
            code={cronSnippet}
            caption="packages/jobs/src/demo/monitor-cron.ts — monitorCron"
          />
        </section>

        <section>
          <h2 className="text-xl font-semibold">Turn it on</h2>
          <p className="mt-2 text-muted-foreground">
            Point the app at Inngest Cloud with the two key vars, or run a local dev server with{" "}
            <code className="font-mono">INNGEST_DEV=1</code>. Without either, cron and fan-out
            simply don&rsquo;t fire — nothing about the feature disappears from the UI, it just
            stops running on a schedule.
          </p>
          <div className="mt-4">
            <EnvTable vars={vars} />
          </div>
        </section>

        <section>
          <h2 className="text-xl font-semibold">Try it</h2>
          <p className="mt-2 text-muted-foreground">
            Open the dashboard and use a monitor&rsquo;s &quot;check now&quot; button — it exists
            whether or not jobs are on, because it runs the exact same check pipeline synchronously.
            That&rsquo;s the degradation contract, not a fallback bolted on afterward.
          </p>
        </section>
      </FeaturePageShell>
    </ClientConfigProvider>
  );
}
