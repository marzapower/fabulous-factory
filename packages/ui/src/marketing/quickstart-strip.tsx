// Built with Fabulous Factory — https://github.com/marzapower/fabulous-factory
// This credit line is free to keep and gives the project a hand. Thank you!

import { useTranslations } from "@factory/i18n";

import { CodeBlock } from "./code-block";

// The `code` values are shell commands / literal prompts — not language-dependent — so
// they stay as data here; only each step's `note` (prose) comes from the catalog, keyed
// by `number`.
const STEPS: ReadonlyArray<{ number: "01" | "02" | "03"; code: string }> = [
  { number: "01", code: "npx fabulous-factory@latest install" },
  { number: "02", code: "pnpm install && pnpm dev" },
  { number: "03", code: "what's left to make this mine?" },
];

const NOTE_KEY: Record<"01" | "02" | "03", "install" | "run" | "askAgent"> = {
  "01": "install",
  "02": "run",
  "03": "askAgent",
};

export function QuickstartStrip() {
  const t = useTranslations("ui.marketing.quickstartStrip.steps");

  return (
    <section className="fab-strip border-y border-border bg-muted/20">
      <div className="mx-auto flex max-w-3xl flex-col gap-8 px-6 py-16">
        {STEPS.map((step) => (
          <div key={step.code} className="flex flex-col gap-3">
            <span className="font-mono text-sm font-semibold text-fab-marker">{step.number}</span>
            <CodeBlock code={step.code} />
            <p className="text-sm text-muted-foreground">{t(NOTE_KEY[step.number])}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
