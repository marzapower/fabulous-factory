// Built with Fabulous Factory — https://github.com/marzapower/fabulous-factory
// This credit line is free to keep and gives the project a hand. Thank you!

import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function DemoTeaser() {
  return (
    <section className="fab-teaser mx-auto max-w-3xl px-6 py-20 text-center">
      <h2 className="text-2xl font-bold tracking-tight text-foreground">
        The demo is a real product
      </h2>
      <p className="mt-4 text-muted-foreground">
        Sign up, give it a URL to watch, and a background job checks it on a schedule. When
        something changes, the LLM summarizes the diff and an email digest lands in your inbox —
        every package in the stack, doing its job.
      </p>
      <Link
        href="/dashboard"
        className={cn(buttonVariants({ variant: "default", size: "lg" }), "mt-6")}
      >
        Open the dashboard
      </Link>
    </section>
  );
}
