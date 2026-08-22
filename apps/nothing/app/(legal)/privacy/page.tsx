import Link from "next/link";
import type { Metadata } from "next";

// Static prose page (design spec shell idiom): no capability reads, no client state — a
// plain server component, matching apps/web/app/page.tsx's container/typography classes.
// Placeholder content only — the `make-it-yours` skill covers replacing it (M9, §J.6).
export const metadata: Metadata = {
  // Bare page name: the root layout's "%s · Fabulous Nothing" template supplies
  // the product name, so hardcoding one here would double it — and hardcoding
  // the TEMPLATE's name on the product's own legal page was simply wrong.
  title: "Privacy Policy",
};

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="text-3xl font-bold tracking-tight">Privacy Policy</h1>
      <p className="mt-2 text-lg leading-relaxed text-muted-foreground">
        Last updated: placeholder.
      </p>

      <div className="mt-6 rounded-lg border bg-muted/50 p-4 text-sm text-muted-foreground">
        This is placeholder text shipped by the template — replace before production. See the{" "}
        <code className="text-foreground">make-it-yours</code> skill.
      </div>

      <div className="mt-8 space-y-8 text-sm leading-relaxed text-muted-foreground">
        <section>
          <h2 className="text-xl font-semibold text-foreground">1. Data collected</h2>
          <p className="mt-2">
            Placeholder: what account, usage, and product data is collected, and why.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground">2. Cookies</h2>
          <p className="mt-2">
            Placeholder: session cookies used for authentication, and any analytics cookies once
            enabled.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground">3. Third parties</h2>
          <p className="mt-2">
            Placeholder: subprocessors (auth, email, analytics, error tracking, billing) and what
            each one sees.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground">4. Contact</h2>
          <p className="mt-2">
            Placeholder: how to reach the company about a data or privacy request.
          </p>
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
