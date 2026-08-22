// Built with Fabulous Factory — https://github.com/marzapower/fabulous-factory
// This credit line is free to keep and gives the project a hand. Thank you!

import { CodeBlock } from "./code-block";

// Illustrative — this shape is exactly what `factory/no-raw-handler` (the ESLint rule
// backing this claim) refuses to let merge; it does not exist anywhere in this repo,
// on purpose. Note what it's missing: no auth mode, no input schema, no rate limit —
// every decision the wrapper below makes mandatory.
const ILLEGAL_HANDLER = `// apps/web/app/api/example/route.ts
export async function GET(req: Request) {
  // No auth mode. No input schema. No rate limit.
  // This fails lint by construction — it cannot merge.
  return Response.json({ ok: true });
}`;

// Verbatim excerpt of the real, currently-shipping route (apps/web/app/api/health/
// route.ts) — not retyped prose-code. `rateLimit: "none"` is itself a decision, spelled
// out rather than defaulted (liveness must never be limited).
const LEGAL_HANDLER = `// apps/web/app/api/health/route.ts
import { defineHandler } from "@factory/core";

export const GET = defineHandler({
  auth: "public",
  input: "none",
  rateLimit: "none",
  handler: async () => ({ status: "ok" }),
});`;

export function KernelCode() {
  return (
    <section className="fab-kernel mx-auto max-w-6xl px-6 py-20">
      <div className="mb-10 max-w-2xl">
        <p className="font-mono text-sm text-fab-marker">// the kernel, in code</p>
        <h2 className="mt-2 text-3xl font-bold tracking-tight text-foreground">
          There is no other way to write a route
        </h2>
        <p className="mt-3 text-muted-foreground">
          <code className="rounded-sm bg-muted px-1 py-0.5 font-mono text-foreground">
            defineHandler
          </code>{" "}
          and{" "}
          <code className="rounded-sm bg-muted px-1 py-0.5 font-mono text-foreground">
            defineAction
          </code>{" "}
          are the only legal way to declare a route or a server action. A raw export doesn&rsquo;t
          get reviewed and rejected — it doesn&rsquo;t compile past lint in the first place.
        </p>
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <CodeBlock code={ILLEGAL_HANDLER} caption="Raw handler — illustrative, not a real file" />
          <p className="font-mono text-xs text-fab-marker">does not lint, does not merge</p>
        </div>
        <div className="flex flex-col gap-2">
          <CodeBlock
            code={LEGAL_HANDLER}
            caption="apps/web/app/api/health/route.ts — real, shipping"
          />
          <p className="font-mono text-xs text-muted-foreground">
            auth mode and rate limit, stated
          </p>
        </div>
      </div>
    </section>
  );
}
