// Built with Fabulous Factory — https://github.com/marzapower/fabulous-factory
// This credit line is free to keep and gives the project a hand. Thank you!

import { useTranslations } from "@factory/i18n";

import { CodeBlock, FeaturePageShell, featureMeta } from "../marketing";
import { KernelEchoDemo } from "./echo-demo";

const illegalSnippet = `// apps/web/app/api/whatever/route.ts
export async function POST(req: Request) {
  const body = await req.json();     // no schema, no cap, no auth mode
  return Response.json({ ok: true, body });
}
// \`eslint-plugin-factory\`'s raw-handler rule fails this file: an exported GET/POST/...
// that doesn't come from defineHandler() does not lint, and CI's lint step is part of
// \`pnpm check\` — this does not merge.`;

const legalSnippet = `// apps/web/app/api/demo/kernel-echo/route.ts
export const POST = defineHandler({
  auth: "public",
  input: z.object({ message: z.string().min(1).max(MAX_MESSAGE_CHARS) }),
  rateLimit: { windowSeconds: 60, max: 8 },
  handler: async ({ input, req }) => {
    return { ok: true, echoedMessage: input.message.slice(0, MAX_MESSAGE_CHARS) };
  },
});`;

export function KernelFeaturePage({ brand, emoji }: { brand: string; emoji?: string }) {
  const t = useTranslations("ui.featurePages.kernel");
  const tc = useTranslations("ui.featurePages.common");
  const tf = useTranslations("ui.features");

  return (
    <FeaturePageShell feature={featureMeta(tf, "kernel")} brand={brand} emoji={emoji}>
      <section>
        <h2 className="text-xl font-semibold">{tc("whatItDoes")}</h2>
        <p className="mt-2 text-muted-foreground">{t("whatItDoesBody")}</p>
      </section>

      <section>
        <h2 className="text-xl font-semibold">{tc("ruleItEnforces")}</h2>
        <p className="mt-2 text-muted-foreground">
          {t.rich("ruleBody", { code: (chunks) => <code className="font-mono">{chunks}</code> })}
        </p>
      </section>

      <section>
        <h2 className="text-xl font-semibold">{tc("realSource")}</h2>
        <p className="mt-2 text-muted-foreground">{t("realSourceIntro")}</p>
        <CodeBlock code={illegalSnippet} caption={t("illegalCaption")} />
        <div className="mt-4">
          <CodeBlock code={legalSnippet} caption="apps/web/app/api/demo/kernel-echo/route.ts" />
        </div>
      </section>

      <section>
        <h2 className="text-xl font-semibold">{tc("workingExample")}</h2>
        <p className="mt-2 text-muted-foreground">{t("workingExampleBody")}</p>
        <div className="mt-4">
          <KernelEchoDemo />
        </div>
        <p className="mt-4 text-sm text-muted-foreground">
          {t.rich("asymmetryNote", {
            code: (chunks) => <code className="font-mono">{chunks}</code>,
          })}
        </p>
      </section>
    </FeaturePageShell>
  );
}
