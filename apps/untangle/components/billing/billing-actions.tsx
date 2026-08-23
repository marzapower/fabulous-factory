"use client";

import { useState } from "react";
import { ArrowUpRight, ExternalLink } from "lucide-react";

import type { PlanId } from "@factory/config";
import { createCheckoutAction, openPortalAction } from "@/app/dashboard/actions";
import { Button } from "@factory/ui/primitives";

/**
 * Free → paid. Redirects to Stripe Checkout on success (`window.location.assign` — the
 * action returns a URL rather than throwing a Next `redirect()`, m7-billing.md H.10.15).
 */
export function UpgradeButton({ plan, planName }: { plan: PlanId; planName: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setPending(true);
    setError(null);

    const outcome = await createCheckoutAction({ plan });
    if (!outcome.ok) {
      setPending(false);
      setError(outcome.error.message);
      return;
    }

    window.location.assign(outcome.data.url);
  }

  return (
    <div className="flex flex-col items-start gap-1.5">
      <Button type="button" size="sm" disabled={pending} onClick={handleClick}>
        <ArrowUpRight className="size-3.5" aria-hidden="true" />
        {pending ? "Starting checkout…" : `Upgrade to ${planName}`}
      </Button>
      {error && (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

/** Subscribed → manage. `null` url (no customer on file yet) renders an inline notice
 * instead of a redirect. */
export function ManageSubscriptionButton() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function handleClick() {
    setPending(true);
    setError(null);
    setNotice(null);

    const outcome = await openPortalAction(undefined);
    setPending(false);

    if (!outcome.ok) {
      setError(outcome.error.message);
      return;
    }

    if (!outcome.data.url) {
      setNotice(
        "No billing account on file yet — this clears up once your subscription is confirmed.",
      );
      return;
    }

    window.location.assign(outcome.data.url);
  }

  return (
    <div className="flex flex-col items-start gap-1.5">
      <Button type="button" variant="outline" size="sm" disabled={pending} onClick={handleClick}>
        <ExternalLink className="size-3.5" aria-hidden="true" />
        {pending ? "Opening…" : "Manage subscription"}
      </Button>
      {notice && <p className="text-xs text-muted-foreground">{notice}</p>}
      {error && (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
