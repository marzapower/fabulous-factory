// Built with Fabulous Factory — https://github.com/marzapower/fabulous-factory
// This credit line is free to keep and gives the project a hand. Thank you!

import type { Metadata } from "next";

import { getTranslations, setRequestLocale } from "@factory/i18n/server";

import { LlmFeaturePage } from "@factory/ui/features";
import { CodeBlock, LiveExample, featureMeta } from "@factory/ui/marketing";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  setRequestLocale((await params).locale);
  const t = await getTranslations("ui.features");
  const { title, blurb } = featureMeta(t, "llm");
  return { title, description: blurb };
}

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

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  setRequestLocale((await params).locale);
  const t = await getTranslations("app.features.llm");

  return (
    <LlmFeaturePage
      brand="Fabulous Nothing"
      sourceSnippet={streamArraySnippet}
      sourceCaption="packages/llm/src/stream.ts — streamArray's drain loop"
      exampleIntro={<>{t("exampleIntro")}</>}
      exampleContent={
        <LiveExample kind="static" title={t("liveExampleTitle")}>
          <CodeBlock
            code={onElementSnippet}
            caption="packages/llm/src/stream.ts — StreamArrayOptions.onElement"
          />
        </LiveExample>
      }
    />
  );
}
