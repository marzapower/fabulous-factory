"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";

import type { CheckOutcome } from "@factory/jobs";
import { checkNowAction } from "@/app/dashboard/actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Mirrors the private `CheckNowResult` type in `app/dashboard/actions.ts` (not exported
// from there — the "use server" raw-handler rule only allows `defineAction(...)` call
// exports from that file).
type CheckNowResult = CheckOutcome | { status: "error"; summary: string };

const RESULT_COPY: Record<CheckNowResult["status"], string> = {
  baseline: "Baseline recorded",
  unchanged: "No changes",
  changed: "Change detected",
  error: "Check failed",
};

export function CheckNowButton({ monitorId }: { monitorId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<CheckNowResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setPending(true);
    setError(null);
    setResult(null);

    const outcome = await checkNowAction({ id: monitorId });
    setPending(false);

    if (!outcome.ok) {
      setError(outcome.error.message);
      return;
    }

    setResult(outcome.data);
    router.refresh();
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button type="button" variant="outline" size="sm" disabled={pending} onClick={handleClick}>
        <RefreshCw className={cn("size-3.5", pending && "animate-spin")} aria-hidden="true" />
        {pending ? "Checking…" : "Check now"}
      </Button>
      {result && (
        <p
          className={cn(
            "font-mono text-xs",
            result.status === "error" ? "text-destructive" : "text-muted-foreground",
          )}
        >
          {RESULT_COPY[result.status]}
          {result.summary ? ` — ${result.summary}` : ""}
        </p>
      )}
      {error && (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
