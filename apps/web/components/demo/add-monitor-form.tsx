"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";

import { createMonitorAction } from "@/app/dashboard/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface AddMonitorFormProps {
  atLimit: boolean;
  /** Plan-aware copy from `@factory/jobs`'s `monitorLimitMessage` — the ONE source for
   * this wording (m7-billing.md H.10.12), never duplicated here. */
  limitMessage: string;
}

export function AddMonitorForm({ atLimit, limitMessage }: AddMonitorFormProps) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [pending, setPending] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setFieldErrors({});
    setFormError(null);

    const outcome = await createMonitorAction({ name, url });
    setPending(false);

    if (!outcome.ok) {
      if (outcome.error.issues) {
        const next: Record<string, string> = {};
        for (const issue of outcome.error.issues) {
          const key = issue.path[0];
          if (typeof key === "string") next[key] = issue.message;
        }
        setFieldErrors(next);
      } else {
        setFormError(outcome.error.message);
      }
      return;
    }

    setName("");
    setUrl("");
    router.refresh();
  }

  if (atLimit) {
    return (
      <p className="rounded-md border border-dashed border-border px-3 py-3 text-sm text-muted-foreground">
        {limitMessage}
      </p>
    );
  }

  return (
    <form className="flex flex-col gap-3" onSubmit={handleSubmit}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <div className="grid flex-1 gap-1.5">
          <Label htmlFor="monitor-name" className="sr-only">
            Name
          </Label>
          <Input
            id="monitor-name"
            placeholder="Name (e.g. Pricing page)"
            required
            maxLength={100}
            value={name}
            onChange={(event) => setName(event.target.value)}
            aria-invalid={Boolean(fieldErrors.name)}
          />
          {fieldErrors.name && (
            <p className="text-xs text-destructive" role="alert">
              {fieldErrors.name}
            </p>
          )}
        </div>
        <div className="grid flex-[1.4] gap-1.5">
          <Label htmlFor="monitor-url" className="sr-only">
            URL
          </Label>
          <Input
            id="monitor-url"
            type="url"
            placeholder="https://example.com"
            required
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            aria-invalid={Boolean(fieldErrors.url)}
          />
          {fieldErrors.url && (
            <p className="text-xs text-destructive" role="alert">
              {fieldErrors.url}
            </p>
          )}
        </div>
        <Button type="submit" disabled={pending} className="shrink-0">
          <Plus className="size-4" aria-hidden="true" />
          {pending ? "Adding…" : "Add monitor"}
        </Button>
      </div>
      {formError && (
        <p className="text-sm text-destructive" role="alert">
          {formError}
        </p>
      )}
    </form>
  );
}
