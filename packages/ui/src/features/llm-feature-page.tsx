// Built with Fabulous Factory — https://github.com/marzapower/fabulous-factory
// This credit line is free to keep and gives the project a hand. Thank you!

import type { ReactNode } from "react";

import { getClientConfig, getEnvDocsForGroup } from "@factory/config";
import { ClientConfigProvider } from "@factory/config/client";

import { CodeBlock, EnvTable, FeaturePageShell, FEATURES, StatusLight } from "../marketing";

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
  const config = getClientConfig();
  const vars = FEATURES.llm.groups.flatMap((group) => getEnvDocsForGroup(group));

  return (
    <ClientConfigProvider config={config}>
      <FeaturePageShell
        feature={FEATURES.llm}
        brand={brand}
        emoji={emoji}
        statusSlot={<StatusLight service="llm" />}
      >
        <section>
          <h2 className="text-xl font-semibold">What it does</h2>
          <p className="mt-2 text-muted-foreground">
            From a caller&rsquo;s side: <code className="font-mono">streamArray()</code> takes a zod
            schema for ONE array element and hands your code a fully-typed element every time the
            model completes one — no partial objects, no vendor SDK types leaking out of{" "}
            <code className="font-mono">@factory/llm</code>.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold">The rule it enforces</h2>
          <p className="mt-2 text-muted-foreground">
            Every call — streaming or not — goes through the same budget check, cost accounting, and{" "}
            <code className="font-mono">llm_calls</code> row, whichever provider profile is
            configured (local, OpenRouter, or a direct key). A call site never spends money it
            wasn&rsquo;t told it could, and a disabled or over-budget call throws before any
            provider SDK is even loaded.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold">Real source</h2>
          <CodeBlock code={sourceSnippet} caption={sourceCaption} />
        </section>

        <section>
          <h2 className="text-xl font-semibold">A working example</h2>
          <p className="mt-2 text-muted-foreground">{exampleIntro}</p>
          <div className="mt-4">{exampleContent}</div>
        </section>

        <section>
          <h2 className="text-xl font-semibold">Turn it on</h2>
          <p className="mt-2 text-muted-foreground">
            Set credentials for any one profile and it lights up. Leave all of it unset and{" "}
            <code className="font-mono">streamArray()</code>/
            <code className="font-mono">generate()</code> throw before any provider SDK loads; every
            call site in this template is written to fall back to a non-AI result rather than let
            that throw reach a user.
          </p>
          <div className="mt-4">
            <EnvTable vars={vars} />
          </div>
        </section>
      </FeaturePageShell>
    </ClientConfigProvider>
  );
}
