// Built with Fabulous Factory — https://github.com/marzapower/fabulous-factory
// This credit line is free to keep and gives the project a hand. Thank you!

import { getClientConfig, getEnvDocsForGroup } from "@factory/config";
import { ClientConfigProvider } from "@factory/config/client";

import {
  CodeBlock,
  EnvTable,
  FeaturePageShell,
  FEATURES,
  LiveExample,
  StatusLight,
} from "../marketing";

// N2 (K.16): this page is Static, not Live — `apps/web` has no `@factory/email`
// dependency at all, and reaching for `@react-email/render` from here directly would
// breach vendor confinement (only `packages/email` may import it). Source + the
// `SUBJECTS` map are shown as excerpts instead of a rendered preview.
const sendSnippet = `export async function send<T extends TemplateName>(
  template: T,
  to: string,
  props: TemplateProps[T],
): Promise<SendResult> {
  const capabilities = getCapabilities();

  if (capabilities.email === "disabled") {
    return { delivered: false, reason: "disabled" };
  }

  const element = TEMPLATES[template](props);
  const subject = SUBJECTS[template];
  const text = await render(element, { plainText: true });

  if (capabilities.email === "console") {
    // Dev-only transport — logs the rendered output, never claims delivery.
    console.log(\`[@factory/email] console transport — "\${subject}" to \${to}\\n---\\n\${text}\\n---\`);
    return { delivered: false, reason: "console" };
  }

  // capabilities.email === "resend" from here on — the ONLY branch that loads the SDK.
  const resend = await getResendClient(env.RESEND_API_KEY ?? "");
  ...
}`;

const subjectsSnippet = `const SUBJECTS: Record<TemplateName, string> = {
  "verify-email": "Verify your email address",
  "magic-link": "Your sign-in link",
  "daily-plan": "Your plan for today",
};`;

export function EmailFeaturePage({ brand, emoji }: { brand: string; emoji?: string }) {
  const config = getClientConfig();
  const vars = FEATURES.email.groups.flatMap((group) => getEnvDocsForGroup(group));

  return (
    <ClientConfigProvider config={config}>
      <FeaturePageShell
        feature={FEATURES.email}
        brand={brand}
        emoji={emoji}
        statusSlot={<StatusLight service="email" />}
      >
        <section>
          <h2 className="text-xl font-semibold">What it does</h2>
          <p className="mt-2 text-muted-foreground">
            From a caller&rsquo;s side: one <code className="font-mono">send()</code> call, naming a
            template and its typed props, works the same whether Resend is configured, missing, or
            you&rsquo;re in local dev — the caller never branches on which.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold">The rule it enforces</h2>
          <p className="mt-2 text-muted-foreground">
            <code className="font-mono">send()</code> reads the email capability once and picks
            exactly one path — disabled, console, or Resend — and the Resend SDK is only ever
            imported on that last branch. A signup can never hang waiting on a provider that
            isn&rsquo;t configured; without one, it just quietly reports itself undelivered instead.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold">Real source</h2>
          <CodeBlock code={sendSnippet} caption="Simplified from packages/email/src/send.ts" />
          <p className="mt-4 text-muted-foreground">
            The subject line for every template lives in one map, never scattered across call sites:
          </p>
          <div className="mt-2">
            <CodeBlock code={subjectsSnippet} caption="packages/email/src/send.ts — SUBJECTS" />
          </div>
        </section>

        <section>
          <h2 className="text-xl font-semibold">A working example</h2>
          <p className="mt-2 text-muted-foreground">
            No preview is rendered here — <code className="font-mono">apps/web</code> deliberately
            carries no dependency on <code className="font-mono">@factory/email</code>, so nothing
            outside the adapter package it belongs to can import the vendor renderer.
          </p>
          <div className="mt-4">
            <LiveExample kind="static" title="Turn it on">
              <p className="text-sm text-muted-foreground">
                Set <code className="font-mono">RESEND_API_KEY</code> (and{" "}
                <code className="font-mono">EMAIL_FROM</code>) and delivery goes live. Leave it
                unset: in development every email prints to the console instead; in production,
                email is off entirely and sign-up just skips the verification step rather than
                blocking on it.
              </p>
              <div className="mt-2">
                <EnvTable vars={vars} />
              </div>
            </LiveExample>
          </div>
        </section>
      </FeaturePageShell>
    </ClientConfigProvider>
  );
}
