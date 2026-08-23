// Built with Fabulous Factory — https://github.com/marzapower/fabulous-factory
// This credit line is free to keep and gives the project a hand. Thank you!

import { BuiltOnFactory } from "@/components/marketing/built-on-factory";
import { DemoTeaser } from "@/components/marketing/demo-teaser";
import { FeaturesLink } from "@/components/marketing/features-link";
import { Hero } from "@/components/marketing/hero";
import { NothingDisappears } from "@/components/marketing/nothing-disappears";
import { SiteFooter, SiteHeader } from "@factory/ui/marketing";
import { ThreePasses } from "@/components/marketing/three-passes";

/**
 * Untangle's own landing page — a real product site, not a pitch for the template that
 * produced it.
 *
 * It runs in two acts. The first sells the product to somebody who has never heard of
 * Fabulous Factory: what it does (hero), how it does it (`ThreePasses`), the one thing it
 * does that nothing else does (`NothingDisappears`), what it deliberately won't do (the
 * honest parts), then the ask. Only after the ask does the second act admit the product
 * is a sample (`BuiltOnFactory`) and open the door to the machinery (`FeaturesLink`).
 *
 * That order is the demonstration. An adopter following `make-it-yours` keeps this exact
 * shape, renames the noun, rewrites the copy, and deletes the second act — which is why
 * the two acts are separate components rather than interleaved sections.
 */
export default function HomePage() {
  return (
    <div className="fab-shell flex min-h-svh flex-col">
      <SiteHeader brand="Fabulous Untangle" emoji="🧶" />

      <main className="flex-1">
        <Hero />

        <ThreePasses />

        <NothingDisappears />

        <section className="fab-honest mx-auto max-w-6xl px-6 py-20">
          <h2 className="max-w-2xl text-3xl font-bold tracking-tight text-balance text-foreground">
            What it won&rsquo;t do
          </h2>
          <ul className="mt-8 grid gap-6 text-muted-foreground sm:grid-cols-3">
            <li>
              <h3 className="font-medium text-foreground">It won&rsquo;t nag you</h3>
              <p className="mt-2 text-sm">
                No streaks, no badges, no push notification at 9pm. The most it will ever send is
                one summary in the morning, and only when the copy you are running has email turned
                on.
              </p>
            </li>
            <li>
              <h3 className="font-medium text-foreground">It won&rsquo;t guess in silence</h3>
              <p className="mt-2 text-sm">
                Every step says whether it used AI or plain rules, and what it cost. When
                there&rsquo;s no AI key, it says so and keeps going.
              </p>
            </li>
            <li>
              <h3 className="font-medium text-foreground">It won&rsquo;t hold your notes</h3>
              <p className="mt-2 text-sm">
                There is no Untangle company holding your data. You run the whole thing yourself,
                and the account you sign up for is an account on your own copy.
              </p>
            </li>
          </ul>
        </section>

        <DemoTeaser />

        <BuiltOnFactory />

        <FeaturesLink />
      </main>

      <SiteFooter />
    </div>
  );
}
