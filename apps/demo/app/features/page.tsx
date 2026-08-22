// Built with Fabulous Factory — https://github.com/marzapower/fabulous-factory
// This credit line is free to keep and gives the project a hand. Thank you!

import type { Metadata } from "next";

import { getClientConfig } from "@factory/config";
import { ClientConfigProvider } from "@factory/config/client";

import { AlreadyWorks } from "@/components/marketing/already-works";
import { ControlPanel } from "@/components/marketing/control-panel";
import { DegradationStrip } from "@/components/marketing/degradation-strip";
import { FeatureCard } from "@/components/marketing/feature-card";
import { FEATURE_LIST } from "@/components/marketing/features-meta";
import { KernelCode } from "@/components/marketing/kernel-code";
import { QuickstartStrip } from "@/components/marketing/quickstart-strip";
import { SiteFooter } from "@/components/marketing/site-footer";
import { SiteHeader } from "@/components/marketing/site-header";
import { StatusLight } from "@/components/marketing/status-light";
import { WhyItHolds } from "@/components/marketing/why-it-holds";

// This page is about the template, not the product, so it overrides the product title
// the root layout sets for every other route.
export const metadata: Metadata = {
  // `absolute` so the root layout's "%s · Untangle" template doesn't append the product
  // name to a page that is explicitly about the template rather than the product.
  title: { absolute: "Fabulous Factory — the machinery behind Untangle" },
  description:
    "The kernel that makes an unguarded route impossible, this deployment's live capability panel, the same run with the AI switched off, and how to get your own repo running.",
};

// Capability-conditional UI must render dynamically (design spec §5.1): capabilities are
// a runtime, server-side fact resolved at request time, never baked into a static build.
export const dynamic = "force-dynamic";

export default function FeaturesIndexPage() {
  const config = getClientConfig();

  return (
    <ClientConfigProvider config={config}>
      <div className="fab-hub flex min-h-svh flex-col">
        <SiteHeader />

        <main className="flex-1">
          <section className="mx-auto max-w-6xl px-6 pt-16 pb-4">
            <div className="max-w-2xl">
              <p className="font-mono text-sm text-fab-marker">// fabulous factory</p>
              <h1 className="mt-2 text-4xl font-bold tracking-tight text-balance text-foreground">
                The machinery behind the product
              </h1>
              <p className="mt-4 text-lg text-muted-foreground">
                Untangle is the sample product that ships with Fabulous Factory — scaffolded with
                one npx command, not cloned from a template. This page is about the factory.
              </p>
              <p className="mt-4 text-lg text-muted-foreground">
                The argument, end to end: what you get on day one, the rule that makes a shortcut
                impossible, proof it&rsquo;s enforced on this exact deployment, proof the product
                keeps working when a piece is missing, how to run it yourself, and every piece you
                can build on next.
              </p>
            </div>
          </section>

          <AlreadyWorks />

          <KernelCode />

          <WhyItHolds />

          <section className="mx-auto max-w-6xl px-6 py-20">
            <div className="mb-10 max-w-2xl">
              <p className="font-mono text-sm text-fab-marker">// this deployment, live</p>
              <h2 className="mt-2 text-3xl font-bold tracking-tight text-foreground">
                Capability lights, not a marketing claim
              </h2>
              <p className="mt-3 text-muted-foreground">
                This panel reads this deployment&rsquo;s own runtime — unset an env var and a
                station goes to standby, live, right here.
              </p>
            </div>
            <ControlPanel />
          </section>

          <DegradationStrip />

          <QuickstartStrip />

          <section className="mx-auto max-w-6xl px-6 py-20">
            <div className="mb-10 max-w-2xl">
              <p className="font-mono text-sm text-fab-marker">// what&rsquo;s already built</p>
              <h2 className="mt-2 text-3xl font-bold tracking-tight text-foreground">
                Nine pieces, four of them load-bearing
              </h2>
              <p className="mt-3 text-muted-foreground">
                Auth, the kernel, config, and security ship unconditionally — there&rsquo;s no env
                var that turns them off. The rest are checked live against this deployment&rsquo;s
                own runtime, the same signal the control panel above reads.
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
        </main>

        <SiteFooter />
      </div>
    </ClientConfigProvider>
  );
}
