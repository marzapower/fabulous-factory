"use client";

import { useState } from "react";
import Link from "next/link";

import type { ProjectSummary } from "@factory/brainstorm";

import { deleteProjectAction } from "@/app/dashboard/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

function formatDate(date: Date): string {
  return new Date(date).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function ProjectCard({ project }: { project: ProjectSummary }) {
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setPending(true);
    const outcome = await deleteProjectAction({ projectId: project.id });
    setPending(false);
    if (outcome.ok) {
      setHidden(true);
    } else {
      setError(outcome.error.message);
      setConfirming(false);
    }
  }

  if (hidden) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-display text-lg">
          <Link href={`/projects/${project.id}`} className="hover:underline">
            {project.name}
          </Link>
        </CardTitle>
        {project.pitch ? <CardDescription>{project.pitch}</CardDescription> : null}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <dl className="flex gap-4 font-mono text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <dt>ideas</dt>
            <dd className="text-foreground">{project.itemCounts.idea}</dd>
          </div>
          <div className="flex items-center gap-1">
            <dt>features</dt>
            <dd className="text-foreground">{project.itemCounts.feature}</dd>
          </div>
          <div className="flex items-center gap-1">
            <dt>notes</dt>
            <dd className="text-foreground">{project.itemCounts.note}</dd>
          </div>
        </dl>
        <div className="flex items-center justify-between">
          <span className="font-mono text-xs text-muted-foreground">
            updated {formatDate(project.updatedAt)}
          </span>
          {confirming ? (
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="destructive"
                onClick={handleDelete}
                disabled={pending}
              >
                {pending ? "Deleting…" : "Really delete?"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setConfirming(false)}
              >
                Cancel
              </Button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="text-xs text-muted-foreground underline underline-offset-4 hover:text-destructive"
            >
              Delete
            </button>
          )}
        </div>
        {error && (
          <p className="text-xs text-destructive" role="alert">
            {error}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
