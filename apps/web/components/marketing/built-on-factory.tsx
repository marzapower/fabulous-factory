// Built with Fabulous Factory — https://github.com/marzapower/fabulous-factory
// This credit line is free to keep and gives the project a hand. Thank you!

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * The Fabulous Factory hint, kept deliberately quiet. Everything above this point sells
 * Untangle; this is the one beat that admits Untangle is a sample, and it earns the
 * right to by listing only things the visitor has already seen working.
 *
 * No cards, no icons, no accent colour — the section is a plain labelled list on the
 * page's own background. It is the least decorated thing here on purpose: a loud
 * "BUILT WITH" badge would read as sponsorship, and this is a footnote.
 */

/**
 * Every line here has to be something this repo actually does — a landing page that
 * overclaims is worse than one that says less. Checked against the code: there is a
 * verification email template but NO password-reset flow (`packages/email/src/templates/`
 * holds `verify-email`, `magic-link` and `daily-plan`, and `packages/auth/src/auth.ts`
 * wires no `sendResetPassword`), so "reset a password" is deliberately absent. Invoices
 * come from Stripe's own customer portal, which `openBillingPortalAction`
 * (`apps/web/app/dashboard/actions.ts`) opens — hence "a billing portal", not a claim to
 * have built invoicing.
 */
const INHERITED: ReadonlyArray<{ label: string; detail: string }> = [
  { label: "Accounts", detail: "Sign up, sign in, verify an address, magic links." },
  {
    label: "Payments",
    detail: "Plans and checkout, and a billing portal for upgrades, cancellations, invoices.",
  },
  { label: "Email", detail: "The morning digest, and the transactional messages around it." },
  { label: "Schedules", detail: "The 07:00 UTC run that builds that digest, retried if it fails." },
  { label: "AI", detail: "Every model call, with what it cost recorded next to the step." },
];

export function BuiltOnFactory() {
  return (
    <section className="fab-origin mx-auto max-w-6xl px-6 py-20">
      <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div className="flex flex-col gap-5">
          <h2 className="text-3xl font-bold tracking-tight text-balance text-foreground">
            The rest of it was already there
          </h2>
          <p className="text-lg text-muted-foreground">
            None of the list on the right was written for Untangle. It came with the template
            Untangle is built on, working, on the first day of the project.
          </p>
          <p className="text-lg text-muted-foreground">
            That&rsquo;s the actual point of this site. Untangle is the sample product that ships
            with <span className="font-medium text-foreground">Fabulous Factory</span> — a small but
            complete app, so you can see what day one looks like before you make it your own.
          </p>
          <div className="mt-2 flex flex-wrap gap-3">
            <a
              href="https://github.com/marzapower/fabulous-factory/generate"
              className={cn(buttonVariants({ variant: "outline", size: "lg" }))}
            >
              Use this template
            </a>
          </div>
        </div>

        <dl className="flex flex-col divide-y divide-border self-start border-y border-border">
          {INHERITED.map((item) => (
            <div key={item.label} className="flex flex-col gap-1 py-4 sm:flex-row sm:gap-6">
              <dt className="font-mono text-sm text-foreground sm:w-32 sm:shrink-0">
                {item.label}
              </dt>
              <dd className="text-sm text-muted-foreground">{item.detail}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
