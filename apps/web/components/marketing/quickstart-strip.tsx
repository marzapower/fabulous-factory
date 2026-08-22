// Built with Fabulous Factory — https://github.com/marzapower/fabulous-factory
// This credit line is free to keep and gives the project a hand. Thank you!

import { CodeBlock } from "./code-block";

const STEPS: ReadonlyArray<{ number: string; code: string; note: string }> = [
  {
    number: "01",
    code: "pnpm install && pnpm dev",
    note: "You're running — Postgres and one secret are the only requirements.",
  },
  {
    number: "02",
    code: "pnpm factory:init",
    note: "The template becomes YOUR repo.",
  },
  {
    number: "03",
    code: "what's left to make this mine?",
    note: "Ask your agent — it walks you through every remaining default, one guided skill at a time.",
  },
];

export function QuickstartStrip() {
  return (
    <section className="fab-strip border-y border-border bg-muted/20">
      <div className="mx-auto flex max-w-3xl flex-col gap-8 px-6 py-16">
        {STEPS.map((step) => (
          <div key={step.code} className="flex flex-col gap-3">
            <span className="font-mono text-sm font-semibold text-fab-marker">{step.number}</span>
            <CodeBlock code={step.code} />
            <p className="text-sm text-muted-foreground">{step.note}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
