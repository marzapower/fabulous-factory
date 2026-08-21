// Built with Fabulous Factory — https://github.com/marzapower/fabulous-factory
// This credit line is free to keep and gives the project a hand. Thank you!

import { getClientConfig } from "@factory/config";
import { ClientConfigProvider } from "@factory/config/client";

import { DemoTeaser } from "@/components/marketing/demo-teaser";
import { FeatureCard } from "@/components/marketing/feature-card";
import { FEATURE_LIST } from "@/components/marketing/features-meta";
import { Hero } from "@/components/marketing/hero";
import { QuickstartStrip } from "@/components/marketing/quickstart-strip";
import { SiteFooter } from "@/components/marketing/site-footer";
import { SiteHeader } from "@/components/marketing/site-header";
import { StatusLight } from "@/components/marketing/status-light";

// Capability-conditional UI must render dynamically (design spec §5.1): capabilities are
// a runtime, server-side fact resolved at request time, never baked into a static build.
export const dynamic = "force-dynamic";

export default function HomePage() {
  const config = getClientConfig();

  return (
    <ClientConfigProvider config={config}>
      <div className="fab-shell flex min-h-svh flex-col">
        <SiteHeader />

        <main className="flex-1">
          <Hero />

          <QuickstartStrip />

          <section id="features" className="mx-auto max-w-6xl scroll-mt-16 px-6 py-20">
            <div className="mb-10 max-w-2xl">
              <p className="font-mono text-sm text-amber-600">// what&rsquo;s already built</p>
              <h2 className="mt-2 text-3xl font-bold tracking-tight text-foreground">
                Six seams, all optional but auth
              </h2>
              <p className="mt-3 text-muted-foreground">
                Each one is checked live against this deployment&rsquo;s own runtime — the same
                signal the control panel above reads from.
              </p>
            </div>

            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURE_LIST.map((feature) => (
                <FeatureCard key={feature.key} feature={feature}>
                  <div className="flex flex-col gap-1">
                    {feature.services.map((s) => (
                      <StatusLight key={s} service={s} />
                    ))}
                  </div>
                </FeatureCard>
              ))}
            </div>
          </section>

          <DemoTeaser />

          <section className="border-t border-border bg-muted/20">
            <div className="mx-auto max-w-3xl px-6 py-16 text-sm text-muted-foreground">
              <h2 className="text-base font-semibold text-foreground">The honest parts</h2>
              <ul className="mt-4 flex flex-col gap-3">
                <li>
                  It&rsquo;s a snapshot, not a subscription — your copy is a fork, yours the day you
                  clone it.
                </li>
                <li>
                  The floor is <code className="font-mono text-foreground">pnpm dev</code>. Below
                  that, this isn&rsquo;t your tool.
                </li>
                <li>
                  Not in v1: multi-tenancy, an admin panel, i18n, metered billing. Scope is a
                  feature.
                </li>
              </ul>
            </div>
          </section>
        </main>

        <SiteFooter />
      </div>
    </ClientConfigProvider>
  );
}
