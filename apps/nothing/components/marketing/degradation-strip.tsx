// Built with Fabulous Factory — https://github.com/marzapower/fabulous-factory
// This credit line is free to keep and gives the project a hand. Thank you!

import { CodeBlock } from "./code-block";

// Static two-column AI-on/AI-off comparison (no recorded run to replay here — this
// preset ships no feature that calls the LLM package yet). Same underlying contract the
// /features/llm page documents: every call site is written to fall back to something
// honest, never to break, when the key is missing.
const withKeySnippet = `const result = await streamArray({ ... });
// result.source === "llm"
// each element typed against the schema, model + cost recorded`;

const withoutKeySnippet = `const result = await streamArray({ ... });
// throws before any provider SDK loads —
// every call site catches this and falls back to
// a non-AI result instead of letting it reach a user`;

export function DegradationStrip() {
  return (
    <section className="fab-degradation border-y border-border bg-muted/20">
      <div className="mx-auto max-w-6xl px-6 py-20">
        <div className="mb-10 max-w-2xl">
          <p className="font-mono text-sm text-fab-marker">// on, or off</p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight text-foreground">
            Unset the LLM key and nothing breaks
          </h2>
          <p className="mt-3 text-muted-foreground">
            Same call, same call site, either way. With a key,{" "}
            <code className="rounded-sm bg-muted px-1 py-0.5 font-mono text-foreground">
              streamArray()
            </code>{" "}
            and{" "}
            <code className="rounded-sm bg-muted px-1 py-0.5 font-mono text-foreground">
              generate()
            </code>{" "}
            do their work. Without one, they throw before any provider SDK ever loads — and every
            call site in the template is written to catch that and fall back to a non-AI result
            rather than let it reach a user.
          </p>
        </div>

        <div className="grid gap-6 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <h3 className="font-mono text-xs tracking-wide text-muted-foreground uppercase">
              With an LLM key
            </h3>
            <CodeBlock code={withKeySnippet} copy={false} />
          </div>
          <div className="flex flex-col gap-2">
            <h3 className="font-mono text-xs tracking-wide text-muted-foreground uppercase">
              Without one
            </h3>
            <CodeBlock code={withoutKeySnippet} copy={false} />
          </div>
        </div>
      </div>
    </section>
  );
}
