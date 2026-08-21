// Built with Fabulous Factory — https://github.com/marzapower/fabulous-factory
// This credit line is free to keep and gives the project a hand. Thank you!

import { getClientConfig, getEnvDocsForGroup } from "@factory/config";
import { ClientConfigProvider } from "@factory/config/client";

import { CodeBlock } from "@/components/marketing/code-block";
import { EnvTable } from "@/components/marketing/env-table";
import { FeaturePageShell } from "@/components/marketing/feature-page-shell";
import { FEATURES } from "@/components/marketing/features-meta";
import { StatusLight } from "@/components/marketing/status-light";

// Capability-conditional UI (design spec §5.1) — the status light below reads a runtime
// fact, never baked into a static build.
export const dynamic = "force-dynamic";

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
  const env = getEnv();
  const resend = await getResendClient(env.RESEND_API_KEY ?? "");
  ...
}`;

export default function EmailFeaturePage() {
  const config = getClientConfig();
  const vars = FEATURES.email.groups.flatMap((group) => getEnvDocsForGroup(group));

  return (
    <ClientConfigProvider config={config}>
      <FeaturePageShell feature={FEATURES.email} statusSlot={<StatusLight service="email" />}>
        <section>
          <h2 className="text-xl font-semibold">What you get</h2>
          <p className="mt-2 text-muted-foreground">
            One <code className="font-mono">send()</code> function backed by Resend, with three
            hand-authored templates ready to go: email verification, magic-link sign-in, and the
            demo&rsquo;s change-digest notification. In development without an API key it prints to
            the console instead of failing; in production without one it simply reports itself
            undelivered — a signup never hangs waiting on a provider that isn&rsquo;t configured.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold">How it works here</h2>
          <p className="mt-2 text-muted-foreground">
            <code className="font-mono">send()</code> reads the email capability once and picks
            exactly one path — disabled, console, or Resend — and the Resend SDK is only ever
            imported on that last branch, never loaded into memory otherwise.
          </p>
          <CodeBlock code={sendSnippet} caption="Simplified from packages/email/src/send.ts" />
        </section>

        <section>
          <h2 className="text-xl font-semibold">Turn it on</h2>
          <p className="mt-2 text-muted-foreground">
            Set <code className="font-mono">RESEND_API_KEY</code> (and{" "}
            <code className="font-mono">EMAIL_FROM</code>) and delivery goes live. Leave it unset:
            in development you get a console-logged copy of every email; in production, email is off
            entirely and auth runs without a verification step — sign-up just skips it rather than
            blocking.
          </p>
          <div className="mt-4">
            <EnvTable vars={vars} />
          </div>
        </section>

        <section>
          <h2 className="text-xl font-semibold">Try it</h2>
          <p className="mt-2 text-muted-foreground">
            Sign up with email configured and a verification mail arrives; with the console
            transport, watch your terminal print the rendered text instead. Either way, the in-app
            feed keeps working without it.
          </p>
        </section>
      </FeaturePageShell>
    </ClientConfigProvider>
  );
}
