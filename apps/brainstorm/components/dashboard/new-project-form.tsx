"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { createProjectAction } from "@/app/dashboard/actions";
import { Button, Input, Label } from "@factory/ui/primitives";

const NAME_MAX_CHARS = 80;
const PITCH_MAX_CHARS = 200;

export function NewProjectForm({ autoFocus = false }: { autoFocus?: boolean }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [pitch, setPitch] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setPending(true);
    setError(null);

    const outcome = await createProjectAction({ name: trimmed, pitch: pitch.trim() || undefined });
    setPending(false);
    if (!outcome.ok) {
      setError(outcome.error.message);
      return;
    }
    router.push(`/projects/${outcome.data.id}`);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 rounded-lg border bg-card p-4">
      <div className="grid gap-2">
        <Label htmlFor="project-name">Project name</Label>
        <Input
          id="project-name"
          autoFocus={autoFocus}
          value={name}
          maxLength={NAME_MAX_CHARS}
          onChange={(e) => setName(e.target.value)}
          placeholder="The thing you're circling"
          required
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="project-pitch">Pitch (optional)</Label>
        <Input
          id="project-pitch"
          value={pitch}
          maxLength={PITCH_MAX_CHARS}
          onChange={(e) => setPitch(e.target.value)}
          placeholder="One line — what is it, roughly"
        />
      </div>
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      <Button type="submit" disabled={pending || !name.trim()} className="self-start">
        {pending ? "Creating…" : "New project"}
      </Button>
    </form>
  );
}
