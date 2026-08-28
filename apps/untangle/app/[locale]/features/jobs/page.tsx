// Built with Fabulous Factory — https://github.com/marzapower/fabulous-factory
// This credit line is free to keep and gives the project a hand. Thank you!

import type { Metadata } from "next";

import { getClientConfig, getEnvDocsForGroup } from "@factory/config";
import { ClientConfigProvider } from "@factory/config/client";
import { getTranslations, setRequestLocale } from "@factory/i18n/server";

import {
  CodeBlock,
  EnvTable,
  FeaturePageShell,
  FEATURES,
  StatusLight,
} from "@factory/ui/marketing";
import { RECORDED_RUN } from "@/components/marketing/recorded-run";

import { RunReplay } from "../run-replay";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  setRequestLocale((await params).locale);
  const t = await getTranslations("ui.features.jobs");
  return { title: t("title"), description: t("blurb") };
}

// Capability-conditional UI (design spec §5.1) — the status light below reads a runtime
// fact, never baked into a static build.
export const dynamic = "force-dynamic";

const cronSnippet = `export const dailyPlanCron = inngest.createFunction(
  { id: "daily-plan-cron", triggers: [{ cron: "0 7 * * *" }] },
  async ({ step }) => {
    const userIds = await step.run("list-users", async () => {
      const rows = await getDb()
        .selectDistinct({ userId: schema.tasks.userId })
        .from(schema.tasks)
        .where(eq(schema.tasks.status, "open"));
      return rows.map((row) => row.userId);
    });

    // One event per user — chunked so a single step.sendEvent payload never grows
    // unbounded with the user count.
    for (const [index, userIdChunk] of chunk(userIds, FAN_OUT_CHUNK_SIZE).entries()) {
      await step.sendEvent(
        \`fan-out-plans-\${index}\`,
        userIdChunk.map((userId) => ({ name: DAILY_PLAN_EVENT, data: { userId } })),
      );
    }
  },
);`;

export default async function JobsFeaturePage({ params }: { params: Promise<{ locale: string }> }) {
  setRequestLocale((await params).locale);
  // getTranslations, not useTranslations/featureMeta: this default export is an async
  // Server Component, and next-intl's sync hook is only callable from a non-async
  // component (https://next-intl.dev/docs/environments/server-client-components#async-components).
  const t = await getTranslations("ui.features.jobs");
  const feature = { ...FEATURES.jobs, title: t("title"), blurb: t("blurb") };
  const config = getClientConfig();
  const vars = FEATURES.jobs.groups.flatMap((group) => getEnvDocsForGroup(group));

  return (
    <ClientConfigProvider config={config}>
      <FeaturePageShell
        feature={feature}
        brand="Fabulous Untangle"
        emoji="🧶"
        statusSlot={<StatusLight service="jobs" />}
      >
        <section>
          <h2 className="text-xl font-semibold">What it does</h2>
          <p className="mt-2 text-muted-foreground">
            From a caller&rsquo;s side: a pipeline is just an ordered list of named steps against
            some state, handed to <code className="font-mono">runPipeline()</code> with a driver —
            the same pipeline runs inline (a live request) or durable (Inngest cron/fan-out with
            per-step retries) without being rewritten for either.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold">The rule it enforces</h2>
          <p className="mt-2 text-muted-foreground">
            Every step&rsquo;s bookkeeping — status, attempt count, cost, timing — runs INSIDE the
            driver&rsquo;s wrapped unit, never around it. Under the durable driver, a step that
            already completed replays as a memoized no-op instead of re-running and re-billing on
            every retry; a step whose <code className="font-mono">onFailure</code> is{" "}
            <code className="font-mono">&quot;abort&quot;</code> rethrows, which is what lets
            Inngest&rsquo;s own step-level retry mean anything.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold">Real source</h2>
          <p className="mt-2 text-muted-foreground">
            The scheduler that fans a daily run out to every user with open tasks, one worker
            invocation each:
          </p>
          <CodeBlock
            code={cronSnippet}
            caption="packages/untangle/src/cron/daily-plan-cron.ts — dailyPlanCron"
          />
        </section>

        <section>
          <h2 className="text-xl font-semibold">A working example</h2>
          <p className="mt-2 text-muted-foreground">
            A live run here would write rows for an anonymous visitor, so this replays a recorded
            capture pipeline run instead — same step order, same event shape a real run emits.
          </p>
          <div className="mt-4">
            <RunReplay events={RECORDED_RUN} title="Recorded capture pipeline run" />
          </div>
        </section>

        <section>
          <h2 className="text-xl font-semibold">Turn it on</h2>
          <p className="mt-2 text-muted-foreground">
            Point the app at Inngest Cloud with the two key vars, or run a local dev server with{" "}
            <code className="font-mono">INNGEST_DEV=1</code>. Without either, cron and fan-out
            simply don&rsquo;t fire — interactive runs are unaffected, since they were always
            inline.
          </p>
          <div className="mt-4">
            <EnvTable vars={vars} />
          </div>
        </section>
      </FeaturePageShell>
    </ClientConfigProvider>
  );
}
