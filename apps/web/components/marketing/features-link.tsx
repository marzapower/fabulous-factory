// Built with Fabulous Factory — https://github.com/marzapower/fabulous-factory
// This credit line is free to keep and gives the project a hand. Thank you!

import Link from "next/link";

export function FeaturesLink() {
  return (
    <section className="fab-features-link mx-auto max-w-6xl px-6 py-16">
      <Link
        href="/features"
        className="fab-card group flex flex-col items-start gap-3 rounded-xl border border-border bg-card p-8 transition-colors hover:border-foreground/40 sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="flex flex-col gap-2">
          <p className="font-mono text-sm text-fab-marker">for developers</p>
          <h2 className="text-2xl font-bold tracking-tight text-foreground">
            Open the machine and look inside
          </h2>
          <p className="max-w-prose text-muted-foreground">
            The rule that makes an unguarded route impossible, a panel reading this exact
            deployment&rsquo;s live capabilities, the same run with the AI switched off, and how to
            get it running yourself.
          </p>
        </div>
        <span
          aria-hidden="true"
          className="font-mono text-2xl text-foreground transition-transform group-hover:translate-x-1"
        >
          →
        </span>
      </Link>
    </section>
  );
}
