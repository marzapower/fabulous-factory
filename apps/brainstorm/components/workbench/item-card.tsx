"use client";

import { useState } from "react";

import type { ProjectItem } from "@factory/brainstorm";

import { Button } from "@factory/ui/primitives";

const DETAIL_MAX_CHARS = 2000;
const TITLE_MAX_CHARS = 120;

export interface ItemCardProps {
  item: ProjectItem;
  onEdit: (patch: { title: string; detail: string | null }) => Promise<boolean>;
  onDelete: () => Promise<void>;
}

export function ItemCard({ item, onEdit, onDelete }: ItemCardProps) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(item.title);
  const [detail, setDetail] = useState(item.detail ?? "");
  const [saving, setSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    const trimmed = title.trim();
    if (!trimmed) return;
    setSaving(true);
    setError(null);
    const ok = await onEdit({ title: trimmed, detail: detail.trim() || null });
    setSaving(false);
    if (ok) {
      setEditing(false);
    } else {
      setError("That edit didn't save. Try again.");
    }
  }

  if (editing) {
    return (
      <li className="flex flex-col gap-2 rounded-md border border-bench-line bg-bench-paper p-3">
        <label className="sr-only" htmlFor={`item-title-${item.id}`}>
          Title
        </label>
        <input
          id={`item-title-${item.id}`}
          value={title}
          maxLength={TITLE_MAX_CHARS}
          onChange={(e) => setTitle(e.target.value)}
          className="rounded-md border border-bench-line bg-background px-2 py-1 text-sm"
        />
        <label className="sr-only" htmlFor={`item-detail-${item.id}`}>
          Detail
        </label>
        <textarea
          id={`item-detail-${item.id}`}
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
          <Button type="button" size="sm" onClick={handleSave} disabled={saving || !title.trim()}>
            {saving ? "Saving…" : "Save"}
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => setEditing(false)}>
            Cancel
          </Button>
        </div>
      </li>
    );
  }

  return (
    <li className="flex flex-col gap-1.5 rounded-md border border-bench-line bg-bench-paper p-3">
      <p className="text-sm font-medium text-bench-ink">{item.title}</p>
      {item.detail ? <p className="text-xs text-muted-foreground">{item.detail}</p> : null}
      <div className="flex gap-3 pt-1">
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
        >
          Edit
        </button>
        {confirmingDelete ? (
          <>
            <button
              type="button"
              onClick={() => void onDelete()}
              className="text-xs font-medium text-destructive underline underline-offset-4"
            >
              Really delete?
            </button>
            <button
              type="button"
              onClick={() => setConfirmingDelete(false)}
              className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
            >
              Cancel
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmingDelete(true)}
            className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
          >
            Delete
          </button>
        )}
      </div>
    </li>
  );
}
