import { ArrowUpRight, CircleDot, ScrollText, TriangleAlert } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatRelativeTime } from "@/components/demo/format-relative-time";
import { cn } from "@/lib/utils";

export interface FeedCardEvent {
  id: string;
  monitorName: string;
  kind: string;
  summary: string;
  createdAt: Date;
}

const KIND_META: Record<
  string,
  { label: string; dot: string; text: string; icon: typeof CircleDot }
> = {
  baseline: {
    label: "Baseline",
    dot: "bg-muted-foreground",
    text: "text-muted-foreground",
    icon: CircleDot,
  },
  change: {
    label: "Change",
    dot: "bg-foreground",
    text: "text-foreground",
    icon: ArrowUpRight,
  },
  error: {
    label: "Error",
    dot: "bg-destructive",
    text: "text-destructive",
    icon: TriangleAlert,
  },
};

const FALLBACK_META = KIND_META.baseline;

export function FeedCard({ events }: { events: FeedCardEvent[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xl">
          <ScrollText className="size-5 text-muted-foreground" aria-hidden="true" />
          Activity
        </CardTitle>
        <CardDescription>What your monitors have seen, most recent first.</CardDescription>
      </CardHeader>
      <CardContent>
        {events.length === 0 ? (
          <p className="rounded-md border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
            No checks yet. Add a monitor and run Check now to see it here.
          </p>
        ) : (
          <ol className="flex flex-col">
            {events.map((event, index) => {
              const meta = KIND_META[event.kind] ?? FALLBACK_META;
              const Icon = meta.icon;
              const isLast = index === events.length - 1;

              return (
                <li key={event.id} className="relative flex gap-3 pb-5 last:pb-0">
                  {!isLast && (
                    <span
                      className="absolute top-4 left-[7px] h-full w-px bg-border"
                      aria-hidden="true"
                    />
                  )}
                  <span
                    className={cn("relative z-10 mt-1 size-[9px] shrink-0 rounded-full", meta.dot)}
                    aria-hidden="true"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                      <span className="flex items-center gap-1.5">
                        <Icon className={cn("size-3.5", meta.text)} aria-hidden="true" />
                        <span
                          className={cn(
                            "font-mono text-[11px] font-semibold tracking-wide uppercase",
                            meta.text,
                          )}
                        >
                          {meta.label}
                        </span>
                        <span className="text-sm font-medium">{event.monitorName}</span>
                      </span>
                      <span className="font-mono text-xs text-muted-foreground">
                        {formatRelativeTime(event.createdAt)}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{event.summary}</p>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
