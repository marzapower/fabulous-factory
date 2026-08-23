// Built with Fabulous Factory — https://github.com/marzapower/fabulous-factory
// This credit line is free to keep and gives the project a hand. Thank you!

import Link from "next/link";

import { buttonVariants } from "../primitives/button";
import { cn } from "../lib/utils";
import { ThemeToggle } from "../theme";

export function SiteHeader({ brand, emoji }: { brand: string; emoji?: string }) {
  return (
    <header className="fab-header sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-6">
        {/* The brand here is the PRODUCT, not the template. That is the demo: an adopter
            passes their own `brand`/`emoji` and the site is theirs. The template gets its
            credit elsewhere on the page (e.g. `built-on-factory.tsx`) and in the footer. */}
        <Link href="/" className="flex items-center gap-2 text-lg font-bold tracking-tight">
          {emoji ? <span aria-hidden="true">{emoji}</span> : null}
          <span>{brand}</span>
        </Link>

        <nav aria-label="Primary" className="flex items-center gap-4 text-sm sm:gap-6">
          <Link
            href="/features"
            className="text-muted-foreground transition-colors hover:text-foreground"
          >
            Under the hood
          </Link>
          <a
            href="https://github.com/marzapower/fabulous-factory"
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted-foreground transition-colors hover:text-foreground"
          >
            GitHub
          </a>
        </nav>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Link href="/login" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
            Sign in
          </Link>
          <Link
            href="/dashboard"
            className={cn(buttonVariants({ variant: "default", size: "sm" }))}
          >
            Dashboard
          </Link>
        </div>
      </div>
    </header>
  );
}
