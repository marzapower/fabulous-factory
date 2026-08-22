// Built with Fabulous Factory — https://github.com/marzapower/fabulous-factory
// This credit line is free to keep and gives the project a hand. Thank you!

import { Bot, Clock, CreditCard, KeyRound, Mail } from "lucide-react";
import type { LucideIcon } from "lucide-react";

// Plain-language counterpart to `FEATURE_LIST` (components/marketing/features-meta.ts):
// same underlying pieces, described by what they do for a person instead of how they're
// built. No package names, no service keys, no links out — that hand-off happens later,
// in the dedicated "how it works" section and on /features.
const ALREADY_WORKS: ReadonlyArray<{ icon: LucideIcon; title: string; body: string }> = [
  {
    icon: KeyRound,
    title: "Signing in",
    body: "People can create an account and log back in. Nothing extra to set up.",
  },
  {
    icon: CreditCard,
    title: "Taking payments",
    body: "Charge for access to different plans. Upgrades, downgrades and cancellations already work.",
  },
  {
    icon: Mail,
    title: "Sending email",
    body: "Address confirmations, sign-in links, and anything else you need to send.",
  },
  {
    icon: Clock,
    title: "Work on a schedule",
    body: "Set something to run every night, every hour, or after a delay — and trust that it will.",
  },
  {
    icon: Bot,
    title: "AI features",
    body: "Add features powered by AI — summarizing, generating, deciding — with usage tracked automatically.",
  },
];

export function AlreadyWorks() {
  return (
    <section className="fab-works mx-auto max-w-6xl px-6 py-20">
      <div className="mb-10 max-w-2xl">
        <p className="font-mono text-sm text-fab-marker">// what already works</p>
        <h2 className="mt-2 text-3xl font-bold tracking-tight text-foreground">
          The things every product needs, already there
        </h2>
        <p className="mt-3 text-muted-foreground">
          You&rsquo;re not starting from zero. These already work on day one.
        </p>
      </div>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {ALREADY_WORKS.map((item) => {
          const Icon = item.icon;
          return (
            <div
              key={item.title}
              className="fab-card flex flex-col gap-3 rounded-xl border border-border bg-card p-6"
            >
              <Icon aria-hidden="true" className="size-7 text-fab-marker" />
              <h3 className="text-lg font-semibold text-foreground">{item.title}</h3>
              <p className="text-sm text-muted-foreground">{item.body}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
