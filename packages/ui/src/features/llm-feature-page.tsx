// Built with Fabulous Factory — https://github.com/marzapower/fabulous-factory
// This credit line is free to keep and gives the project a hand. Thank you!

import type { ReactNode } from "react";

import { useTranslations } from "@factory/i18n";

import { getClientConfig, getEnvDocsForGroup } from "@factory/config";
import { ClientConfigProvider } from "@factory/config/client";

import {
  CodeBlock,
  EnvTable,
  FeaturePageShell,
  FEATURES,
  StatusLight,
  featureMeta,
} from "../marketing";

export function LlmFeaturePage({
  brand,
  emoji,
  sourceSnippet,
  sourceCaption,
  exampleIntro,
  exampleContent,
}: {
  brand: string;
  emoji?: string;
  /** The "Real source" snippet — the one real call site (or the package internals, for
   * a preset with no caller yet) this preset can honestly point at. */
  sourceSnippet: string;
  sourceCaption: string;
  /** "A working example" intro paragraph — why this section replays/shows a static
   * artifact instead of making a real, money-spending call. */
  exampleIntro: ReactNode;
  /** The replay/static artifact itself (a `RunReplay` or a `LiveExample`+`CodeBlock`). */
  exampleContent: ReactNode;
}) {
  const t = useTranslations("ui.featurePages.llm");
  const tc = useTranslations("ui.featurePages.common");
  const tf = useTranslations("ui.features");
  const config = getClientConfig();
  const vars = FEATURES.llm.groups.flatMap((group) => getEnvDocsForGroup(group));

  return (
    <ClientConfigProvider config={config}>
      <FeaturePageShell
        feature={featureMeta(tf, "llm")}
        brand={brand}
        emoji={emoji}
        statusSlot={<StatusLight service="llm" />}
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
          <CodeBlock code={sourceSnippet} caption={sourceCaption} />
        </section>

        <section>
          <h2 className="text-xl font-semibold">{tc("workingExample")}</h2>
          <p className="mt-2 text-muted-foreground">{exampleIntro}</p>
          <div className="mt-4">{exampleContent}</div>
        </section>

        <section>
          <h2 className="text-xl font-semibold">{tc("turnItOn")}</h2>
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
