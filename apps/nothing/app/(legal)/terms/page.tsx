import Link from "next/link";
import type { Metadata } from "next";

// Static prose page (design spec shell idiom): no capability reads, no client state — a
// plain server component, matching apps/web/app/page.tsx's container/typography classes.
// Placeholder content only — the `make-it-yours` skill covers replacing it (M9, §J.6).
export const metadata: Metadata = {
  // Bare page name: the root layout's "%s · Fabulous Nothing" template supplies
  // the product name, so hardcoding one here would double it — and hardcoding
  // the TEMPLATE's name on the product's own legal page was simply wrong.
  title: "Terms of Service",
};

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="text-3xl font-bold tracking-tight">Terms of Service</h1>
      <p className="mt-2 text-lg leading-relaxed text-muted-foreground">
        Last updated: placeholder.
      </p>

      <div className="mt-6 rounded-lg border bg-muted/50 p-4 text-sm text-muted-foreground">
        This is placeholder text shipped by the template — replace before production. See the{" "}
        <code className="text-foreground">make-it-yours</code> skill.
      </div>

      <div className="mt-8 space-y-8 text-sm leading-relaxed text-muted-foreground">
        <section>
          <h2 className="text-xl font-semibold text-foreground">1. Service description</h2>
          <p className="mt-2">
            Placeholder: describe what the product does, who it's for, and what using it means the
            customer agrees to.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground">2. Accounts</h2>
          <p className="mt-2">
            Placeholder: account eligibility, credential responsibility, and grounds for suspension
            or termination.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground">3. Payment</h2>
          <p className="mt-2">
            Placeholder: pricing, billing cycle, refund policy, and what happens to access when a
            subscription lapses.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground">4. Liability</h2>
          <p className="mt-2">
            Placeholder: warranty disclaimer and limitation of liability language, reviewed by
            counsel before this repo ships to real customers.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground">5. Contact</h2>
          <p className="mt-2">Placeholder: how to reach the company about these terms.</p>
        </section>
      </div>

      <p className="mt-10 text-sm text-muted-foreground">
        <Link href="/" className="underline underline-offset-4">
          Back to home
        </Link>
      </p>
    </main>
  );
}
