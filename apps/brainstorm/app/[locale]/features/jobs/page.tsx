// Built with Fabulous Factory — https://github.com/marzapower/fabulous-factory
// This credit line is free to keep and gives the project a hand. Thank you!

import type { Metadata } from "next";

import { getTranslations, setRequestLocale } from "@factory/i18n/server";

import { getClientConfig, getEnvDocsForGroup } from "@factory/config";
import { ClientConfigProvider } from "@factory/config/client";

import {
  CodeBlock,
  EnvTable,
  FeaturePageShell,
  FEATURES,
  featureMeta,
  LiveExample,
  StatusLight,
} from "@factory/ui/marketing";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "ui.features" });
  const meta = featureMeta(t, "jobs");
  return { title: meta.title, description: meta.blurb };
}

// Capability-conditional UI (design spec §5.1) — the status light below reads a runtime
// fact, never baked into a static build.
export const dynamic = "force-dynamic";

const clientSnippet = `const env = getEnv();
const isDev = getCapabilities().jobs === "inngest" && env.INNGEST_DEV === "1";

export const inngest = new Inngest({
  id: "fabulous-factory",
  eventKey: env.INNGEST_EVENT_KEY,
  signingKey: env.INNGEST_SIGNING_KEY,
  isDev,
});`;

// Promoted from the same registry "Real source" points at (K.16-style N2: this preset's
// one LLM step runs inline on every chat turn, never through a registered function) — the
// exact before/after `pnpm gen job` leaves the registry in, taken straight from the
// `add-a-job` skill's Phase 1/2.
const registrySnippet = `// packages/jobs/src/functions/index.ts, before your first job:
export const functions = [];

// after \`pnpm gen job send-digest-email\` + the two edits \`add-a-job\` prints:
import { sendDigestEmail } from "./send-digest-email";
export const functions = [sendDigestEmail];`;

export default async function JobsFeaturePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "ui.features" });
  const config = getClientConfig();
  const vars = FEATURES.jobs.groups.flatMap((group) => getEnvDocsForGroup(group));

  return (
    <ClientConfigProvider config={config}>
      <FeaturePageShell
        feature={featureMeta(t, "jobs")}
        brand="Fabulous Brainstorm Chat"
        emoji="💭"
        statusSlot={<StatusLight service="jobs" />}
      >
        <section>
          <h2 className="text-xl font-semibold">What it does</h2>
          <p className="mt-2 text-muted-foreground">
            From a caller&rsquo;s side: <code className="font-mono">@factory/jobs</code> is one
            Inngest client and one function registry, nothing more — this preset&rsquo;s one LLM
            step runs inline on every chat turn, never through a registered function, so the
            registry ships empty. Scaffold a job with{" "}
            <code className="font-mono">pnpm gen job &lt;name&gt;</code>, register it, and it runs
            on Inngest Cloud or a local dev server identically, whichever is configured.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold">The rule it enforces</h2>
          <p className="mt-2 text-muted-foreground">
            Every registered function shares the same client, so{" "}
            <code className="font-mono">INNGEST_EVENT_KEY</code>/
            <code className="font-mono">INNGEST_SIGNING_KEY</code>/
            <code className="font-mono">INNGEST_DEV</code> govern all of them identically — there is
            no per-job env wiring to get wrong. The Inngest SDK itself stays confined to this
            package (and to any domain package that ships its own functions, e.g. the Untangle
            preset&rsquo;s <code className="font-mono">packages/untangle</code>) — never a direct
            import anywhere else, boundary-enforced by{" "}
            <code className="font-mono">pnpm boundaries</code>.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold">Real source</h2>
          <p className="mt-2 text-muted-foreground">
            The module-scope client every registered function is built against:
          </p>
          <CodeBlock
            code={clientSnippet}
            caption="packages/jobs/src/client.ts — the Inngest client"
          />
        </section>

        <section>
          <h2 className="text-xl font-semibold">A working example</h2>
          <p className="mt-2 text-muted-foreground">
            This preset ships with no functions registered yet — the registry below is a literal
            empty array until your first <code className="font-mono">pnpm gen job</code>, so instead
            of a fake run, here is exactly what that scaffold-and-register flow changes.
          </p>
          <div className="mt-4">
            <LiveExample kind="static" title="The registry, before and after your first job">
              <CodeBlock
                code={registrySnippet}
                caption="packages/jobs/src/functions/index.ts — the registry pnpm gen job populates"
                copy={false}
              />
            </LiveExample>
          </div>
        </section>

        <section>
          <h2 className="text-xl font-semibold">Turn it on</h2>
          <p className="mt-2 text-muted-foreground">
            Point the app at Inngest Cloud with the two key vars, or run a local dev server with{" "}
            <code className="font-mono">INNGEST_DEV=1</code>. Without either, whatever functions you
            register simply don&rsquo;t fire — the chat turn&rsquo;s inline LLM step never depended
            on Inngest being configured.
          </p>
          <div className="mt-4">
            <EnvTable vars={vars} />
          </div>
        </section>
      </FeaturePageShell>
    </ClientConfigProvider>
  );
}
