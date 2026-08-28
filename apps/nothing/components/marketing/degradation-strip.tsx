// Built with Fabulous Factory — https://github.com/marzapower/fabulous-factory
// This credit line is free to keep and gives the project a hand. Thank you!

import { getTranslations } from "@factory/i18n/server";

import { CodeBlock } from "@factory/ui/marketing";

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

export async function DegradationStrip() {
  const t = await getTranslations("app.degradationStrip");

  return (
    <section className="fab-degradation border-y border-border bg-muted/20">
      <div className="mx-auto max-w-6xl px-6 py-20">
        <div className="mb-10 max-w-2xl">
          <p className="font-mono text-sm text-fab-marker">{t("eyebrow")}</p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight text-foreground">{t("heading")}</h2>
          <p className="mt-3 text-muted-foreground">
            {t.rich("body", {
              code: (chunks) => (
                <code className="rounded-sm bg-muted px-1 py-0.5 font-mono text-foreground">
                  {chunks}
                </code>
              ),
            })}
          </p>
        </div>

        <div className="grid gap-6 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <h3 className="font-mono text-xs tracking-wide text-muted-foreground uppercase">
              {t("withKeyLabel")}
            </h3>
            <CodeBlock code={withKeySnippet} copy={false} />
          </div>
          <div className="flex flex-col gap-2">
            <h3 className="font-mono text-xs tracking-wide text-muted-foreground uppercase">
              {t("withoutKeyLabel")}
            </h3>
            <CodeBlock code={withoutKeySnippet} copy={false} />
          </div>
        </div>
      </div>
    </section>
  );
}
