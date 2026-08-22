// Built with Fabulous Factory — https://github.com/marzapower/fabulous-factory
// This credit line is free to keep and gives the project a hand. Thank you!

import type { Metadata } from "next";

import { getClientConfig, getEnvDocsForGroup } from "@factory/config";
import { ClientConfigProvider } from "@factory/config/client";

import { CodeBlock } from "@/components/marketing/code-block";
import { EnvTable } from "@/components/marketing/env-table";
import { FeaturePageShell } from "@/components/marketing/feature-page-shell";
import { FEATURES } from "@/components/marketing/features-meta";
import { LiveExample } from "@/components/marketing/live-example";
import { StatusLight } from "@/components/marketing/status-light";

export const metadata: Metadata = {
  title: FEATURES.llm.title,
  description: FEATURES.llm.blurb,
};

// Capability-conditional UI (design spec §5.1) — the status light below reads a runtime
// fact, never baked into a static build.
export const dynamic = "force-dynamic";

const streamArraySnippet = `// WE own the drain loop — never \`await result.output\` (dropping the parsed-object
// path avoids orphaning a row a caller already streamed to a client on a malformed
// trailing element). Each element is accumulated AND handed to the caller's onElement,
// in arrival order, the instant the model finishes it.
const accumulated = [];
let index = 0;
for await (const element of result.elementStream) {
  const typedElement = element;
  accumulated.push(typedElement);
  if (opts.onElement) {
    try {
      opts.onElement(typedElement, index);
    } catch (callbackError) {
      captureException(callbackError, { source: "streamArray.onElement", index });
    }
  }
  index += 1;
}`;

// Promoted from the "Real source" snippet above (K.16-style N2: this preset ships with no
// feature that calls streamArray() yet) — the exact onElement contract every caller gets,
// taken straight from packages/llm's own exported type.
const onElementSnippet = `export interface StreamArrayOptions<S extends z.ZodType> extends GenerateOptions {
  /** Schema of ONE array element. */
  element: S;
  /** Invoked once per element, in arrival order, as the model completes it.
   *  A throw here is caught and logged — it never fails the call. */
  onElement?: (element: z.infer<S>, index: number) => void;
}`;

export default function LlmFeaturePage() {
  const config = getClientConfig();
  const vars = FEATURES.llm.groups.flatMap((group) => getEnvDocsForGroup(group));

  return (
    <ClientConfigProvider config={config}>
      <FeaturePageShell feature={FEATURES.llm} statusSlot={<StatusLight service="llm" />}>
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
          <CodeBlock
            code={streamArraySnippet}
            caption="packages/llm/src/stream.ts — streamArray's drain loop"
          />
        </section>

        <section>
          <h2 className="text-xl font-semibold">A working example</h2>
          <p className="mt-2 text-muted-foreground">
            A live call here would spend money on anonymous traffic, and this preset ships with no
            feature that calls it yet — so instead of a fake button, here is the exact contract a
            caller gets back on every element, taken straight from the snippet above.
          </p>
          <div className="mt-4">
            <LiveExample kind="static" title="What a caller receives">
              <CodeBlock
                code={onElementSnippet}
                caption="packages/llm/src/stream.ts — StreamArrayOptions.onElement"
              />
            </LiveExample>
          </div>
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
