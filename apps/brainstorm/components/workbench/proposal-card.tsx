import type { ItemKind } from "@factory/brainstorm";

import { cn } from "@/lib/utils";

const KIND_LABEL: Record<ItemKind, string> = {
  idea: "Idea",
  feature: "Feature",
  note: "Note",
};

export interface ProposalCardProps {
  id: string;
  kind: ItemKind;
  title: string;
  detail: string | null;
  /** `true` once accepted — the signature move: the card straightens from its resting
   * 0.4deg tilt to 0deg as it "files" onto the board (`.spark-card[data-accepted="true"]`
   * in globals.css), a single 180ms transform+color transition. */
  accepted: boolean;
  /** `true` when this card's turn failed to persist server-side — accept/dismiss are
   * disabled and a note is shown instead, rather than let the user act on a card that may
   * not actually exist in the database. */
  unsaved?: boolean;
  /** `true` while this card's turn is still streaming — the underlying item row is only
   * written to the database AFTER `runBrainstormTurn` resolves (`app/api/chat/route.ts`),
   * so accept/dismiss stay disabled until the turn finishes, or `setItemStatusAction`
   * would 404 against a row that doesn't exist yet. */
  pending?: boolean;
  onAccept?: () => void;
  onDismiss?: () => void;
}

export function ProposalCard({
  id,
  kind,
  title,
  detail,
  accepted,
  unsaved = false,
  pending = false,
  onAccept,
  onDismiss,
}: ProposalCardProps) {
  const disabled = unsaved || accepted || pending;
  const titleId = `proposal-title-${id}`;

  return (
    <div
      id={`proposal-${id}`}
      className={cn(
        "spark-card flex flex-col gap-1.5 rounded-md border border-l-[3px] border-bench-line border-l-spark bg-bench-paper p-3",
      )}
      data-accepted={accepted}
      aria-labelledby={titleId}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="rounded-full bg-spark-soft px-2 py-0.5 font-mono text-[0.65rem] tracking-wide text-spark uppercase">
          {KIND_LABEL[kind]}
        </span>
      </div>
      <p id={titleId} className="text-sm font-medium text-bench-ink">
        {title}
      </p>
      {detail ? <p className="text-xs text-muted-foreground">{detail}</p> : null}

      {unsaved ? (
        <p className="text-xs text-destructive" role="alert">
          Didn&rsquo;t save — refresh before trusting this card.
        </p>
      ) : accepted ? (
        <p className="text-xs text-muted-foreground">Landed on the board.</p>
      ) : pending ? (
        <p className="text-xs text-muted-foreground">Saving…</p>
      ) : (
        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={onAccept}
            disabled={disabled}
            className="rounded-md bg-spark px-3 py-1 text-xs font-medium text-white disabled:opacity-50"
          >
            Accept
          </button>
          <button
            type="button"
            onClick={onDismiss}
            disabled={disabled}
            className="rounded-md border border-bench-line px-3 py-1 text-xs font-medium text-bench-ink hover:bg-muted disabled:opacity-50"
          >
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
}
