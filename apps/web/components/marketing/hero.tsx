// Built with Fabulous Factory — https://github.com/marzapower/fabulous-factory
// This credit line is free to keep and gives the project a hand. Thank you!

import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ControlPanel } from "./control-panel";

export function Hero() {
  return (
    <section className="fab-hero mx-auto grid max-w-6xl gap-12 px-6 py-16 sm:py-24 lg:grid-cols-2 lg:items-center">
      <div className="flex flex-col gap-6">
        <p className="font-mono text-sm text-amber-600">// the micro-saas factory</p>

        <h1 className="text-4xl font-bold tracking-tight text-balance text-foreground sm:text-5xl">
          Running before your coffee gets cold.
        </h1>

        <p className="max-w-prose text-lg text-muted-foreground">
          Auth, billing, jobs, email, and observability are already wired in. Point your agents at
          the feature you&rsquo;re building — the foundation is done.
        </p>

        <div className="flex flex-wrap gap-3">
          <a
            href="https://github.com/marzapower/fabulous-factory/generate"
            className={cn(buttonVariants({ variant: "default", size: "lg" }))}
          >
            Use this template
          </a>
          <Link href="#features" className={cn(buttonVariants({ variant: "outline", size: "lg" }))}>
            Explore the features
          </Link>
        </div>
      </div>

      <ControlPanel />
    </section>
  );
}
