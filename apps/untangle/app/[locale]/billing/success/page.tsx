import { redirect } from "next/navigation";
import { CheckCircle2 } from "lucide-react";

import { requireSession } from "@factory/auth";
import { isEnabled } from "@factory/config";
import { Link } from "@factory/i18n/navigation";
import { setRequestLocale } from "@factory/i18n/server";
import {
  buttonVariants,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@factory/ui/primitives";

// Session-gated, never statically prerendered (same rule as the dashboard page).
export const dynamic = "force-dynamic";

/**
 * Checkout return page (m7-billing.md H.2.12/H.10.15). Deliberately does NOT read or
 * process the `session_id` query param Stripe appends — the webhook-fed subscriptions
 * cache is the sole source of truth for entitlement (H.10.7: `checkout.session.completed`
 * is log-only), so this page is just a calm landing spot while that webhook lands, not a
 * confirmation of anything itself.
 *
 * Redirects to `/dashboard` when billing is disabled (H.10 review fix) — this URL is only
 * ever reachable via a Checkout success redirect, which can't happen when there's no
 * billing provider to have started a session in the first place; a direct hit is stale or
 * probing, and the billing-disabled dashboard has nothing checkout-related to confirm.
 */
export default async function BillingSuccessPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  setRequestLocale((await params).locale);
  await requireSession({ redirectTo: "/login" });

  if (!isEnabled("billing")) {
    redirect("/dashboard");
  }

  return (
    <main className="flex min-h-svh items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl">
            <CheckCircle2 className="size-5 text-muted-foreground" aria-hidden="true" />
            Thanks — you&apos;re subscribing
          </CardTitle>
          <CardDescription>
            Your subscription is being activated in the background. This can take a few seconds —
            it&apos;ll show up on your dashboard as soon as it&apos;s confirmed.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/dashboard" className={buttonVariants({ variant: "outline" })}>
            Back to dashboard
          </Link>
        </CardContent>
      </Card>
    </main>
  );
}
