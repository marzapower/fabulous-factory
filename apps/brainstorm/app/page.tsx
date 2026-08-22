// Built with Fabulous Factory — https://github.com/marzapower/fabulous-factory
// This credit line is free to keep and gives the project a hand. Thank you!

import Link from "next/link";

import { SiteFooter } from "@/components/marketing/site-footer";
import { SiteHeader } from "@/components/marketing/site-header";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const STEPS: ReadonlyArray<{ label: string; body: string }> = [
  {
    label: "Say it",
    body: "Tell the assistant what you're circling — a product idea, a redesign, a half-formed plan. No form to fill in first.",
  },
  {
    label: "It sparks",
    body: "Prose comes back, and every idea worth keeping arrives as its own card — an idea, a feature, or a note — right in the stream.",
  },
  {
    label: "It's on the board",
    body: "Accept a card and it lands on the board for good. Dismiss it and it's out of the way, not gone — a quiet disclosure keeps it if you change your mind.",
  },
];

/**
 * This preset's own landing page — a real product site, not a pitch for the template
 * that produced it (same posture as `apps/untangle/app/page.tsx`). The hero vignette
 * below is pure HTML/CSS: no recorded-run machinery, nothing borrowed from `/features`'s
 * live examples — a static composition of one user line, one assistant line, and a spark
 * card mid-tilt, exactly as they'd render live in the workbench.
 */
export default function HomePage() {
  return (
    <div className="fab-shell flex min-h-svh flex-col">
      <SiteHeader />

      <main className="flex-1">
        <section className="mx-auto grid max-w-6xl gap-12 px-6 py-20 lg:grid-cols-2 lg:items-center">
          <div>
            <p className="font-mono text-sm text-fab-marker">// fabulous brainstorm chat</p>
            <h1 className="mt-2 font-display text-4xl font-bold tracking-tight text-balance text-foreground sm:text-5xl">
              Talk it out. Keep what sparks.
            </h1>
            <p className="mt-6 max-w-md text-lg text-muted-foreground">
              A chat-based project brainstormer. Describe what you&rsquo;re circling, an AI partner
              talks it through with you, and every idea worth keeping lands on a board you can
              always edit by hand.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <Link href="/signup" className={cn(buttonVariants({ size: "lg" }))}>
                Start brainstorming
              </Link>
              <Link
                href="/features"
                className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
              >
                See how it&rsquo;s built
              </Link>
            </div>
            <p className="mt-6 max-w-md text-sm text-muted-foreground">
              No LLM key? The board still works — chat lights up when you add one.
            </p>
          </div>

          {/* The static vignette: one user line, one assistant line, one spark card
              mid-tilt. Nothing here is live or animated on load — the workbench itself is
              where the motion happens. */}
          <div
            aria-hidden="true"
            className="flex flex-col gap-3 rounded-xl border border-bench-line bg-bench-paper p-5 shadow-sm"
          >
            <div className="self-end rounded-lg bg-bench-ink px-3 py-2 text-sm text-bench-paper">
              a shared grocery list, for roommates who never sync
            </div>
            <div className="max-w-[85%] rounded-lg border border-bench-line bg-background px-3 py-2 text-sm text-bench-ink">
              Real-time sync is what makes it click — nobody re-buys the milk.
            </div>
            <div className="spark-card flex flex-col gap-1 rounded-md border border-l-[3px] border-bench-line border-l-spark bg-background p-3">
              <span className="w-fit rounded-full bg-spark-soft px-2 py-0.5 font-mono text-[0.65rem] tracking-wide text-spark uppercase">
                Feature
              </span>
              <p className="text-sm font-medium text-bench-ink">Real-time list sync</p>
              <p className="text-xs text-muted-foreground">
                Every household member sees edits instantly.
              </p>
            </div>
          </div>
        </section>

        <section className="border-y border-border bg-muted/20">
          <div className="mx-auto flex max-w-3xl flex-col gap-10 px-6 py-16">
            {STEPS.map((step, index) => (
              <div key={step.label} className="flex gap-4">
                <span className="font-mono text-sm text-fab-marker">0{index + 1}</span>
                <div>
                  <h2 className="font-display text-lg font-semibold text-foreground">
                    {step.label}
                  </h2>
                  <p className="mt-1 text-muted-foreground">{step.body}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-2xl px-6 py-20 text-center">
          <p className="text-lg text-muted-foreground">
            No LLM key? The board still works — chat lights up when you add one.
          </p>
          <div className="mt-8">
            <Link href="/signup" className={cn(buttonVariants({ size: "lg" }))}>
              Start brainstorming
            </Link>
          </div>
          <p className="mt-6 text-sm text-muted-foreground">
            <Link href="/features" className="underline underline-offset-4 hover:text-foreground">
              Under the hood
            </Link>
          </p>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
