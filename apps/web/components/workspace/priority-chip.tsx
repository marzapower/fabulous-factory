import { cn } from "@/lib/utils";

/**
 * Priority carried by ink DENSITY, never hue (K.9) — `now` is a solid ink chip, `next`
 * is outlined, `later` is plain grey text. Stays legible for colour-blind readers and
 * keeps `--fab-live` unambiguous as the ONE thing on this page that means "in flight".
 * `null` (untriaged — the `triage` step hasn't reached this task yet) renders a quiet
 * placeholder rather than guessing.
 */
export function PriorityChip({ priority }: { priority: "now" | "next" | "later" | null }) {
  if (priority === null) {
    return (
      <span className="rounded-full px-2 py-0.5 text-xs text-muted-foreground" aria-live="polite">
        triaging…
      </span>
    );
  }

  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-xs font-medium",
        priority === "now" && "bg-foreground text-background",
        priority === "next" && "border border-foreground text-foreground",
        priority === "later" && "text-muted-foreground",
      )}
    >
      {priority}
    </span>
  );
}
