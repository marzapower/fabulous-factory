// Built with Fabulous Factory — https://github.com/marzapower/fabulous-factory
// This credit line is free to keep and gives the project a hand. Thank you!

import { Link } from "@factory/i18n/navigation";

import { buttonVariants } from "@factory/ui/primitives";
import { cn } from "@/lib/utils";

export function DemoTeaser() {
  return (
    <section className="fab-teaser border-y border-border bg-muted/20">
      <div className="mx-auto max-w-3xl px-6 py-20 text-center">
        <h2 className="text-3xl font-bold tracking-tight text-foreground">
          Go and empty your head
        </h2>
        <p className="mt-4 text-lg text-muted-foreground">
          Paste the worst, least organised thing you have. It works better on a real mess than on a
          tidy one.
        </p>
        <Link
          href="/dashboard"
          className={cn(buttonVariants({ variant: "default", size: "lg" }), "mt-8")}
        >
          Paste your own mess
        </Link>
      </div>
    </section>
  );
}
