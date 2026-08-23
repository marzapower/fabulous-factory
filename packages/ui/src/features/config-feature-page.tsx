// Built with Fabulous Factory — https://github.com/marzapower/fabulous-factory
// This credit line is free to keep and gives the project a hand. Thank you!

import { getClientConfig } from "@factory/config";
import { ClientConfigProvider } from "@factory/config/client";

import { CodeBlock, FeaturePageShell, FEATURES, LiveExample } from "../marketing";
import { CapabilityMap } from "./capability-map";

const buildClientConfigSnippet = `export interface ClientConfig {
  capabilities: Record<ServiceName, boolean>;
  appUrl: string;
  posthog: { key: string; host: string } | null;
}

// ON/OFF BOOLEANS ONLY. Adapter identities ('stripe', 'sentry', 'resend', …) are recon
// data for an attacker and must never appear here — only whether a capability is
// enabled, plus the small set of genuinely non-secret publishables.
export function buildClientConfig(env: RawEnv, capabilities: Capabilities): ClientConfig {
  ...
}`;

export function ConfigFeaturePage({ brand, emoji }: { brand: string; emoji?: string }) {
  const config = getClientConfig();

  return (
    <ClientConfigProvider config={config}>
      <FeaturePageShell feature={FEATURES.config} brand={brand} emoji={emoji}>
        <section>
          <h2 className="text-xl font-semibold">What it does</h2>
          <p className="mt-2 text-muted-foreground">
            From the caller&rsquo;s side: one function,{" "}
            <code className="font-mono">getClientConfig()</code>, boils down every service&rsquo;s
            runtime state into the small, safe slice of it a browser is ever allowed to see — a
            boolean per capability, nothing more.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold">The rule it enforces</h2>
          <p className="mt-2 text-muted-foreground">
            The client boundary carries on/off booleans only. Adapter identities — which provider is
            actually behind &quot;llm&quot; or &quot;email&quot; — never cross it, because
            that&rsquo;s recon data for an attacker probing what a deployment runs. A component that
            needs to show &quot;billing is on&quot; can; nothing can ask &quot;is it Stripe&quot;
            from the browser.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold">Real source</h2>
          <p className="mt-2 text-muted-foreground">
            The type this page&rsquo;s live capability map below is built from:
          </p>
          <CodeBlock
            code={buildClientConfigSnippet}
            caption="packages/config/src/public-config.ts — buildClientConfig()"
          />
        </section>

        <section>
          <h2 className="text-xl font-semibold">A working example</h2>
          <p className="mt-2 text-muted-foreground">
            Not a mockup — this is this deployment&rsquo;s own capability map, read at request time.
          </p>
          <div className="mt-4">
            <LiveExample kind="live" title="This deployment&rsquo;s capability map">
              <CapabilityMap />
            </LiveExample>
          </div>
        </section>
      </FeaturePageShell>
    </ClientConfigProvider>
  );
}
