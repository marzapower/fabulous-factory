"use client";

import { useRef, useState, type KeyboardEvent } from "react";

import { Button, Input } from "@factory/ui/primitives";

import { renameProjectAction } from "@/app/[locale]/projects/[id]/actions";

const NAME_MAX_CHARS = 80;
const PITCH_MAX_CHARS = 200;

export interface ProjectHeaderProps {
  projectId: string;
  name: string;
  pitch: string | null;
}

/**
 * Click-to-edit project title + pitch, wired to `renameProjectAction`
 * (`app/[locale]/projects/[id]/actions.ts`) — that action was fully built (validated,
 * 404-handled, `defineAction`) with zero call sites before this. Mirrors the envelope
 * handling other actions in this app use (`{ ok: true, data } | { ok: false, error }`,
 * see `workbench.tsx`'s `handleEditItem`) and the board's optimistic-update-then-
 * rollback pattern (`handleSetItemStatus`/`handleDeleteItem`): the edit form closes and
 * the new name/pitch render immediately, and only revert if the server call comes back
 * `ok: false`.
 *
 * a11y: both fields carry a visually-hidden `<label>`; Enter commits, Escape cancels
 * without saving and returns focus to the Edit button (round-tripping focus rather than
 * dropping it).
 */
export function ProjectHeader({
  projectId,
  name: initialName,
  pitch: initialPitch,
}: ProjectHeaderProps) {
  const [name, setName] = useState(initialName);
  const [pitch, setPitch] = useState(initialPitch ?? "");
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(initialName);
  const [draftPitch, setDraftPitch] = useState(initialPitch ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const editButtonRef = useRef<HTMLButtonElement>(null);

  function startEditing() {
    setDraftName(name);
    setDraftPitch(pitch);
    setError(null);
    setEditing(true);
  }

  function cancelEditing() {
    setEditing(false);
    setError(null);
    editButtonRef.current?.focus();
  }

  async function commit() {
    const trimmedName = draftName.trim();
    if (!trimmedName) {
      setError("Name can't be empty.");
      return;
    }
    const trimmedPitch = draftPitch.trim();
    const previousName = name;
    const previousPitch = pitch;

    // Optimistic: close the form and show the new values right away.
    setEditing(false);
    setError(null);
    setName(trimmedName);
    setPitch(trimmedPitch);
    setPending(true);

    const outcome = await renameProjectAction({
      projectId,
      name: trimmedName,
      pitch: trimmedPitch,
    });

    setPending(false);
    if (!outcome.ok) {
      setName(previousName);
      setPitch(previousPitch);
      setError(outcome.error.message);
    }
    editButtonRef.current?.focus();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      void commit();
    } else if (event.key === "Escape") {
      event.preventDefault();
      cancelEditing();
    }
  }

  if (editing) {
    return (
      <div className="flex flex-col gap-2">
        <div className="flex flex-col gap-1">
          <label htmlFor="project-name" className="sr-only">
            Project name
          </label>
          <Input
            id="project-name"
            autoFocus
            value={draftName}
            maxLength={NAME_MAX_CHARS}
            onChange={(event) => setDraftName(event.target.value)}
            onKeyDown={handleKeyDown}
            disabled={pending}
            className="font-display text-2xl font-bold tracking-tight"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="project-pitch" className="sr-only">
            Project pitch
          </label>
          <Input
            id="project-pitch"
            value={draftPitch}
            maxLength={PITCH_MAX_CHARS}
            placeholder="One-line pitch (optional)"
            onChange={(event) => setDraftPitch(event.target.value)}
            onKeyDown={handleKeyDown}
            disabled={pending}
          />
        </div>
        <div className="flex gap-2">
          <Button type="button" size="sm" onClick={() => void commit()} disabled={pending}>
            Save
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={cancelEditing}
            disabled={pending}
          >
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  return (
    <header className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">{name}</h1>
        <button
          ref={editButtonRef}
          type="button"
          onClick={startEditing}
          aria-label="Edit project name and pitch"
          className="rounded-sm text-xs font-medium text-muted-foreground underline underline-offset-4 hover:text-foreground"
        >
          Edit
        </button>
        {pending ? (
          <span aria-live="polite" className="text-xs text-muted-foreground">
            Saving…
          </span>
        ) : null}
      </div>
      {pitch ? <p className="text-muted-foreground">{pitch}</p> : null}
      {error ? (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </header>
  );
}
