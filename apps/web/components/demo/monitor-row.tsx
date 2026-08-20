"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";

import { deleteMonitorAction } from "@/app/dashboard/actions";
import { Button } from "@/components/ui/button";
import { CheckNowButton } from "@/components/demo/check-now-button";

export interface MonitorRowData {
  id: string;
  name: string;
  url: string;
  /** Pre-formatted server-side (via `formatRelativeTime`, see `monitors-card.tsx`) — a
   * client component must never call `Date.now()` during render, which would produce a
   * different label on hydration than the server-rendered markup. `null` iff never
   * checked. */
  lastCheckedLabel: string | null;
}

export function MonitorRow({ monitor }: { monitor: MonitorRowData }) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setDeleting(true);
    setError(null);

    const outcome = await deleteMonitorAction({ id: monitor.id });
    if (!outcome.ok) {
      setDeleting(false);
      setError(outcome.error.message);
      return;
    }

    router.refresh();
  }

  return (
    <li className="flex flex-col gap-3 border-b border-border py-4 last:border-b-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{monitor.name}</p>
        <p className="truncate font-mono text-xs text-muted-foreground" title={monitor.url}>
          {monitor.url}
        </p>
        <p className="mt-0.5 font-mono text-xs text-muted-foreground">
          {monitor.lastCheckedLabel ? `checked ${monitor.lastCheckedLabel}` : "not checked yet"}
        </p>
      </div>
      <div className="flex shrink-0 items-start gap-2 self-end sm:self-center">
        <CheckNowButton monitorId={monitor.id} />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          disabled={deleting}
          aria-label={`Delete ${monitor.name}`}
          onClick={handleDelete}
        >
          <Trash2 className="size-4" aria-hidden="true" />
        </Button>
      </div>
      {error && (
        <p className="w-full text-xs text-destructive sm:text-right" role="alert">
          {error}
        </p>
      )}
    </li>
  );
}
