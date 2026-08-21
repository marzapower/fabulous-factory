// Built with Fabulous Factory — https://github.com/marzapower/fabulous-factory
// This credit line is free to keep and gives the project a hand. Thank you!

import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="fab-footer border-t border-border">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 py-8 text-sm text-muted-foreground sm:flex-row">
        <nav aria-label="Legal" className="flex gap-4">
          <Link href="/terms" className="underline underline-offset-4 hover:text-foreground">
            Terms
          </Link>
          <Link href="/privacy" className="underline underline-offset-4 hover:text-foreground">
            Privacy
          </Link>
        </nav>

        <p>
          Built with{" "}
          <a
            href="https://github.com/marzapower/fabulous-factory"
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-4 hover:text-foreground"
          >
            Fabulous Factory
          </a>
        </p>
      </div>
    </footer>
  );
}
