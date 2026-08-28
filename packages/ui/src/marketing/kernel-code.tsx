// Built with Fabulous Factory — https://github.com/marzapower/fabulous-factory
// This credit line is free to keep and gives the project a hand. Thank you!

import { useTranslations } from "@factory/i18n";

import { CodeBlock } from "./code-block";

// Illustrative — this shape is exactly what `factory/no-raw-handler` (the ESLint rule
// backing this claim) refuses to let merge; it does not exist anywhere in this repo,
// on purpose. Note what it's missing: no auth mode, no input schema, no rate limit —
// every decision the wrapper below makes mandatory.
const ILLEGAL_HANDLER = `// app/api/example/route.ts
export async function GET(req: Request) {
  // No auth mode. No input schema. No rate limit.
  // This fails lint by construction — it cannot merge.
  return Response.json({ ok: true });
}`;

// Verbatim excerpt of the real, currently-shipping route (app/api/health/route.ts) —
// not retyped prose-code. `rateLimit: "none"` is itself a decision, spelled out rather
// than defaulted (liveness must never be limited).
const LEGAL_HANDLER = `// app/api/health/route.ts
import { defineHandler } from "@factory/core";

export const GET = defineHandler({
  auth: "public",
  input: "none",
  rateLimit: "none",
  handler: async () => ({ status: "ok" }),
});`;

export function KernelCode() {
  const t = useTranslations("ui.marketing.kernelCode");

  return (
    <section className="fab-kernel mx-auto max-w-6xl px-6 py-20">
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
          <CodeBlock code={ILLEGAL_HANDLER} caption={t("illegalCaption")} />
          <p className="font-mono text-xs text-fab-marker">{t("illegalNote")}</p>
        </div>
        <div className="flex flex-col gap-2">
          <CodeBlock code={LEGAL_HANDLER} caption={t("legalCaption")} />
          <p className="font-mono text-xs text-muted-foreground">{t("legalNote")}</p>
        </div>
      </div>
    </section>
  );
}
