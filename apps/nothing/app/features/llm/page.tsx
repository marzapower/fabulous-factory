// Built with Fabulous Factory — https://github.com/marzapower/fabulous-factory
// This credit line is free to keep and gives the project a hand. Thank you!

import type { Metadata } from "next";

import { LlmFeaturePage } from "@factory/ui/features";
import { CodeBlock, FEATURES, LiveExample } from "@factory/ui/marketing";

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

export default function Page() {
  return (
    <LlmFeaturePage
      brand="Fabulous Nothing"
      sourceSnippet={streamArraySnippet}
      sourceCaption="packages/llm/src/stream.ts — streamArray's drain loop"
      exampleIntro={
        <>
          A live call here would spend money on anonymous traffic, and this preset ships with no
          feature that calls it yet — so instead of a fake button, here is the exact contract a
          caller gets back on every element, taken straight from the snippet above.
        </>
      }
      exampleContent={
        <LiveExample kind="static" title="What a caller receives">
          <CodeBlock
            code={onElementSnippet}
            caption="packages/llm/src/stream.ts — StreamArrayOptions.onElement"
          />
        </LiveExample>
      }
    />
  );
}
