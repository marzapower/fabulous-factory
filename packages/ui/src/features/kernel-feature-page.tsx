// Built with Fabulous Factory — https://github.com/marzapower/fabulous-factory
// This credit line is free to keep and gives the project a hand. Thank you!

import { CodeBlock, FeaturePageShell, FEATURES } from "../marketing";
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
  return (
    <FeaturePageShell feature={FEATURES.kernel} brand={brand} emoji={emoji}>
      <section>
        <h2 className="text-xl font-semibold">What it does</h2>
        <p className="mt-2 text-muted-foreground">
          From the caller&rsquo;s side: every route and server action in this repo declares its auth
          mode, its input schema, and (when public) its rate-limit policy up front, in one place,
          before any of your handler code runs.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-semibold">The rule it enforces</h2>
        <p className="mt-2 text-muted-foreground">
          <code className="font-mono">defineHandler</code> and{" "}
          <code className="font-mono">defineAction</code> are the ONLY legal way to declare a route
          handler or server action. A raw{" "}
          <code className="font-mono">export async function GET/POST/...</code>, or a raw exported
          function in a <code className="font-mono">&quot;use server&quot;</code> file, fails lint
          by construction — there is nowhere left to forget an auth check, skip input validation, or
          ship an unlimited public endpoint by accident.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-semibold">Real source</h2>
        <p className="mt-2 text-muted-foreground">
          The handler backing the live example below, declared the only legal way, next to the raw
          handler shape it replaces:
        </p>
        <CodeBlock code={illegalSnippet} caption="What fails lint — never merges" />
        <div className="mt-4">
          <CodeBlock code={legalSnippet} caption="apps/web/app/api/demo/kernel-echo/route.ts" />
        </div>
      </section>

      <section>
        <h2 className="text-xl font-semibold">A working example</h2>
        <p className="mt-2 text-muted-foreground">
          This calls the real echo endpoint above, on this deployment. It costs nothing, needs no
          account, and makes no outbound request — the handler only echoes a capped slice of what
          you send it.
        </p>
        <div className="mt-4">
          <KernelEchoDemo />
        </div>
        <p className="mt-4 text-sm text-muted-foreground">
          One asymmetry worth noticing: the origin check above (
          <code className="font-mono">defineHandler</code>&rsquo;s step 4) only runs for
          state-changing methods, and it allows a request with no{" "}
          <code className="font-mono">Origin</code> header at all while rejecting one whose{" "}
          <code className="font-mono">sec-fetch-site</code> is{" "}
          <code className="font-mono">cross-site</code>. That means a copyable{" "}
          <code className="font-mono">curl</code> command succeeds against this route where a
          cross-origin browser call from another site is refused — the check targets the browser
          threat model (CSRF from a signed-in tab), not server-to-server callers, which is exactly
          why it works that way rather than being a hole in it.
        </p>
      </section>
    </FeaturePageShell>
  );
}
