"use client";

import { useState } from "react";

import type { ItemKind, ProjectItem } from "@factory/brainstorm";

import { AddItemForm } from "./add-item-form";
import { ItemCard } from "./item-card";
import { ProposalCard } from "./proposal-card";

const KINDS: ItemKind[] = ["idea", "feature", "note"];
const KIND_LABEL: Record<ItemKind, string> = { idea: "Ideas", feature: "Features", note: "Notes" };

export interface BoardPaneProps {
  items: ProjectItem[];
  onAcceptProposal: (id: string) => Promise<void>;
  onDismissProposal: (id: string) => Promise<void>;
  onAddItem: (kind: ItemKind, input: { title: string; detail: string | null }) => Promise<boolean>;
  onEditItem: (id: string, patch: { title: string; detail: string | null }) => Promise<boolean>;
  onDeleteItem: (id: string) => Promise<void>;
}

export function BoardPane({
  items,
  onAcceptProposal,
  onDismissProposal,
  onAddItem,
  onEditItem,
  onDeleteItem,
}: BoardPaneProps) {
  const [dismissedOpen, setDismissedOpen] = useState(false);

  const proposed = items.filter((item) => item.status === "proposed");
  const dismissed = items.filter((item) => item.status === "dismissed");

  return (
    <div className="flex flex-col gap-6">
      {proposed.length > 0 ? (
        <section className="flex flex-col gap-2" aria-label="Pending proposals">
          <h2 className="font-display text-sm font-medium text-bench-ink">
            Pending{" "}
            <span className="font-mono text-xs text-muted-foreground">({proposed.length})</span>
          </h2>
          <div className="flex flex-col gap-2">
            {proposed.map((item) => (
              <ProposalCard
                key={item.id}
                id={item.id}
                kind={item.kind}
                title={item.title}
                detail={item.detail}
                accepted={false}
                onAccept={() => void onAcceptProposal(item.id)}
                onDismiss={() => void onDismissProposal(item.id)}
              />
            ))}
          </div>
        </section>
      ) : null}

      {KINDS.map((kind) => {
        const kindItems = items.filter((item) => item.kind === kind && item.status === "accepted");
        return (
          <section key={kind} className="flex flex-col gap-2" aria-label={KIND_LABEL[kind]}>
            <h2 className="font-display text-sm font-medium text-bench-ink">
              {KIND_LABEL[kind]}{" "}
              <span className="font-mono text-xs text-muted-foreground">({kindItems.length})</span>
            </h2>
            {kindItems.length > 0 ? (
              <ul className="flex flex-col gap-2">
                {kindItems.map((item) => (
                  <ItemCard
                    key={item.id}
                    item={item}
                    onEdit={(patch) => onEditItem(item.id, patch)}
                    onDelete={() => onDeleteItem(item.id)}
                  />
                ))}
              </ul>
            ) : (
              <p className="text-xs text-muted-foreground">Nothing here yet.</p>
            )}
            <AddItemForm kind={kind} onAdd={(input) => onAddItem(kind, input)} />
          </section>
        );
      })}

      {dismissed.length > 0 ? (
        <section className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => setDismissedOpen((v) => !v)}
            className="self-start font-mono text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
            aria-expanded={dismissedOpen}
          >
            dismissed ({dismissed.length})
          </button>
          {dismissedOpen ? (
            <ul className="flex flex-col gap-2">
              {dismissed.map((item) => (
                <ItemCard
                  key={item.id}
                  item={item}
                  onEdit={(patch) => onEditItem(item.id, patch)}
                  onDelete={() => onDeleteItem(item.id)}
                />
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
