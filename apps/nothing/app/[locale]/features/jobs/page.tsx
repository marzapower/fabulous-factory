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
  LiveExample,
  StatusLight,
  featureMeta,
} from "@factory/ui/marketing";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  setRequestLocale((await params).locale);
  const t = await getTranslations("ui.features");
  const { title, blurb } = featureMeta(t, "jobs");
  return { title, description: blurb };
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

// Promoted from the same registry "Real source" points at (K.16-style N2: this preset
// ships with nothing registered yet) — the exact before/after `pnpm gen job` leaves the
// registry in, taken straight from the `add-a-job` skill's Phase 1/2.
const registrySnippet = `// packages/jobs/src/functions/index.ts, before your first job:
export const functions = [];

// after \`pnpm gen job send-welcome-email\` + the two edits \`add-a-job\` prints:
import { sendWelcomeEmail } from "./send-welcome-email";
export const functions = [sendWelcomeEmail];`;

export default async function JobsFeaturePage({ params }: { params: Promise<{ locale: string }> }) {
  setRequestLocale((await params).locale);
  const t = await getTranslations("app.features.jobs");
  const tf = await getTranslations("ui.features");
  const config = getClientConfig();
  const vars = FEATURES.jobs.groups.flatMap((group) => getEnvDocsForGroup(group));

  return (
    <ClientConfigProvider config={config}>
      <FeaturePageShell
        feature={featureMeta(tf, "jobs")}
        brand="Fabulous Nothing"
        statusSlot={<StatusLight service="jobs" />}
      >
        <section>
          <h2 className="text-xl font-semibold">{t("whatItDoes")}</h2>
          <p className="mt-2 text-muted-foreground">
            {t.rich("whatItDoesBody", {
              code: (chunks) => <code className="font-mono">{chunks}</code>,
            })}
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold">{t("ruleItEnforces")}</h2>
          <p className="mt-2 text-muted-foreground">
            {t.rich("ruleBody", {
              code: (chunks) => <code className="font-mono">{chunks}</code>,
            })}
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold">{t("realSource")}</h2>
          <p className="mt-2 text-muted-foreground">{t("realSourceBody")}</p>
          <CodeBlock code={clientSnippet} caption={t("clientCaption")} />
        </section>

        <section>
          <h2 className="text-xl font-semibold">{t("workingExample")}</h2>
          <p className="mt-2 text-muted-foreground">
            {t.rich("workingExampleBody", {
              code: (chunks) => <code className="font-mono">{chunks}</code>,
            })}
          </p>
          <div className="mt-4">
            <LiveExample kind="static" title={t("registryLiveExampleTitle")}>
              <CodeBlock code={registrySnippet} caption={t("registryCaption")} />
            </LiveExample>
          </div>
        </section>

        <section>
          <h2 className="text-xl font-semibold">{t("turnItOn")}</h2>
          <p className="mt-2 text-muted-foreground">
            {t.rich("turnItOnBody", {
              code: (chunks) => <code className="font-mono">{chunks}</code>,
            })}
          </p>
          <div className="mt-4">
            <EnvTable vars={vars} />
          </div>
        </section>
      </FeaturePageShell>
    </ClientConfigProvider>
  );
}
