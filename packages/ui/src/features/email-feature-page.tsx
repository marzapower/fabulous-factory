// Built with Fabulous Factory — https://github.com/marzapower/fabulous-factory
// This credit line is free to keep and gives the project a hand. Thank you!

import { useTranslations } from "@factory/i18n";

import { getClientConfig, getEnvDocsForGroup } from "@factory/config";
import { ClientConfigProvider } from "@factory/config/client";

import {
  CodeBlock,
  EnvTable,
  FeaturePageShell,
  FEATURES,
  LiveExample,
  StatusLight,
  featureMeta,
} from "../marketing";

// N2 (K.16): this page is Static, not Live — `apps/web` has no `@factory/email`
// dependency at all, and reaching for `@react-email/render` from here directly would
// breach vendor confinement (only `packages/email` may import it). Source + the
// `TEMPLATES` map are shown as excerpts instead of a rendered preview.
const sendSnippet = `export async function send<T extends TemplateName>(
  template: T,
  to: string,
  props: TemplateProps[T],
): Promise<SendResult> {
  const capabilities = getCapabilities();

  if (capabilities.email === "disabled") {
    return { delivered: false, reason: "disabled" };
  }

  const { Component, subject } = TEMPLATES[template];
  const element = Component(props);
  const text = await render(element, { plainText: true });

  if (capabilities.email === "console") {
    // Dev-only transport — logs the rendered output, never claims delivery.
    console.log(\`[@factory/email] console transport — "\${subject}" to \${to}\\n---\\n\${text}\\n---\`);
    return { delivered: false, reason: "console" };
  }

  // capabilities.email === "resend" from here on — the ONLY branch that loads the SDK.
  const resend = await getResendClient(env.RESEND_API_KEY ?? "");
  ...
}`;

const subjectsSnippet = `const TEMPLATES: Record<TemplateName, TemplateEntry> = {
  "verify-email": { Component: VerifyEmail, subject: "Verify your email address" },
  "magic-link": { Component: MagicLink, subject: "Your sign-in link" },
  "daily-plan": { Component: DailyPlan, subject: "Your plan for today" },
};`;

export function EmailFeaturePage({ brand, emoji }: { brand: string; emoji?: string }) {
  const t = useTranslations("ui.featurePages.email");
  const tc = useTranslations("ui.featurePages.common");
  const tf = useTranslations("ui.features");
  const config = getClientConfig();
  const vars = FEATURES.email.groups.flatMap((group) => getEnvDocsForGroup(group));

  return (
    <ClientConfigProvider config={config}>
      <FeaturePageShell
        feature={featureMeta(tf, "email")}
        brand={brand}
        emoji={emoji}
        statusSlot={<StatusLight service="email" />}
      >
        <section>
          <h2 className="text-xl font-semibold">{tc("whatItDoes")}</h2>
          <p className="mt-2 text-muted-foreground">
            {t.rich("whatItDoesBody", {
              code: (chunks) => <code className="font-mono">{chunks}</code>,
            })}
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold">{tc("ruleItEnforces")}</h2>
          <p className="mt-2 text-muted-foreground">
            {t.rich("ruleBody", { code: (chunks) => <code className="font-mono">{chunks}</code> })}
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold">{tc("realSource")}</h2>
          <CodeBlock code={sendSnippet} caption={t("sendSnippetCaption")} />
          <p className="mt-4 text-muted-foreground">{t("templatesIntro")}</p>
          <div className="mt-2">
            <CodeBlock
              code={subjectsSnippet}
              caption="packages/email/src/templates/index.ts — TEMPLATES"
            />
          </div>
        </section>

        <section>
          <h2 className="text-xl font-semibold">{tc("workingExample")}</h2>
          <p className="mt-2 text-muted-foreground">
            {t.rich("workingExampleIntro", {
              code: (chunks) => <code className="font-mono">{chunks}</code>,
            })}
          </p>
          <div className="mt-4">
            <LiveExample kind="static" title={t("turnItOnLabel")}>
              <p className="text-sm text-muted-foreground">
                {t.rich("turnItOnBody", {
                  code: (chunks) => <code className="font-mono">{chunks}</code>,
                })}
              </p>
              <div className="mt-2">
                <EnvTable vars={vars} />
              </div>
            </LiveExample>
          </div>
        </section>
      </FeaturePageShell>
    </ClientConfigProvider>
  );
}
