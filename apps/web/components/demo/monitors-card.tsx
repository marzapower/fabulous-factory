import { Radar, TriangleAlert } from "lucide-react";

import type { MonitorListItem } from "@factory/jobs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AddMonitorForm } from "@/components/demo/add-monitor-form";
import { formatRelativeTime } from "@/components/demo/format-relative-time";
import { MonitorRow } from "@/components/demo/monitor-row";

export interface MonitorsCardProps {
  monitors: MonitorListItem[];
  maxMonitors: number;
  jobsEnabled: boolean;
}

export function MonitorsCard({ monitors, maxMonitors, jobsEnabled }: MonitorsCardProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-xl">
              <Radar className="size-5 text-muted-foreground" aria-hidden="true" />
              Monitors
            </CardTitle>
            <CardDescription>Watch a page. Get told when it changes.</CardDescription>
          </div>
          <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 font-mono text-xs text-muted-foreground">
            {monitors.length}/{maxMonitors}
          </span>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {!jobsEnabled && (
          <p className="flex items-start gap-2 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            Automatic checks are off — configure Inngest or use Check now.
          </p>
        )}

        <AddMonitorForm atLimit={monitors.length >= maxMonitors} maxMonitors={maxMonitors} />

        {monitors.length === 0 ? (
          <p className="rounded-md border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
            No monitors yet. Add a page above to start watching it.
          </p>
        ) : (
          <ul className="-mt-1">
            {monitors.map((monitor) => (
              <MonitorRow
                key={monitor.id}
                monitor={{
                  id: monitor.id,
                  name: monitor.name,
                  url: monitor.url,
                  // Formatted here, server-side, so the client row only ever renders a
                  // fixed string — never calls `Date.now()` during its own render (which
                  // would mismatch the server-rendered markup on hydration).
                  lastCheckedLabel: monitor.lastCheckedAt
                    ? formatRelativeTime(monitor.lastCheckedAt)
                    : null,
                }}
              />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
