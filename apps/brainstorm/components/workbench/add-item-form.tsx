"use client";

import { useState, type FormEvent } from "react";

import type { ItemKind } from "@factory/brainstorm";

import { Button, Input } from "@factory/ui/primitives";

const TITLE_MAX_CHARS = 120;
const DETAIL_MAX_CHARS = 2000;

export function AddItemForm({
  kind,
  onAdd,
}: {
  kind: ItemKind;
  onAdd: (input: { title: string; detail: string | null }) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [detail, setDetail] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) return;
    setPending(true);
    setError(null);
    const ok = await onAdd({ title: trimmed, detail: detail.trim() || null });
    setPending(false);
    if (ok) {
      setTitle("");
      setDetail("");
      setOpen(false);
    } else {
      setError("That didn't save. Try again.");
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="self-start text-xs font-medium text-muted-foreground underline underline-offset-4 hover:text-foreground"
      >
        + Add {kind}
      </button>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-2 rounded-md border border-bench-line p-3"
    >
      <Input
        autoFocus
        placeholder="Title"
        value={title}
        maxLength={TITLE_MAX_CHARS}
        onChange={(e) => setTitle(e.target.value)}
      />
      <textarea
        placeholder="Detail (optional)"
        value={detail}
        maxLength={DETAIL_MAX_CHARS}
        onChange={(e) => setDetail(e.target.value)}
        rows={2}
        className="rounded-md border border-bench-line bg-background px-2 py-1 text-xs"
      />
      {error ? (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending || !title.trim()}>
          {pending ? "Adding…" : "Add"}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
