// Built with Fabulous Factory — https://github.com/marzapower/fabulous-factory
// This credit line is free to keep and gives the project a hand. Thank you!

"use client";

import { useState } from "react";

import type { RunEvent } from "@factory/untangle";

import { LiveExample } from "@/components/marketing/live-example";
// Shared with the live workspace's RunStrip on purpose: this replay renders the same
// RunEvents the real run does, so a hand-rolled formatter here would show one duration
// ("1240ms") where the workspace shows another ("1.2s") for the identical event.
import { formatCents, formatDuration } from "@/components/workspace/format";

function describeEvent(event: RunEvent): string {
  switch (event.type) {
    case "run-started":
      return `run ${event.runId} started`;
    case "step": {
      const bits = [event.key, event.status];
      if (event.source) bits.push(event.source);
      if (event.model) bits.push(event.model);
      if (typeof event.costCents === "number") bits.push(formatCents(event.costCents));
      if (typeof event.durationMs === "number") bits.push(formatDuration(event.durationMs));
      return bits.join(" · ");
    }
    case "data":
      return `data: ${JSON.stringify(event.payload)}`;
    case "run-finished": {
      const bits = [`run finished`, event.status];
      if (typeof event.totalCostCents === "number") {
        bits.push(`${formatCents(event.totalCostCents)} total`);
      }
      return bits.join(" · ");
    }
  }
}

/**
 * Replays a recorded `RunEvent` sequence — no server call, no cost, nothing that can
 * break on a keyless clone (K.15.0.1). `events` is imported verbatim from T11's
 * `recorded-run.ts`, typed against the real `RunEvent` (K.16 N5) so drift is a compile
 * error, not a silently stale replay.
 */
export function RunReplay({ events, title }: { events: readonly RunEvent[]; title: string }) {
  const [replayKey, setReplayKey] = useState(0);

  return (
    <LiveExample kind="replay" title={title}>
      <p className="text-xs text-muted-foreground">recorded run — try it yourself after signup</p>
      <ol
        key={replayKey}
        className="flex flex-col gap-1 rounded-md border border-border bg-background p-3 font-mono text-xs"
      >
        {events.map((event, index) => (
          <li
            key={index}
            className="motion-safe:animate-in motion-safe:fade-in motion-safe:duration-300"
            style={{ animationDelay: `${index * 60}ms`, animationFillMode: "backwards" }}
          >
            {describeEvent(event)}
          </li>
        ))}
      </ol>
      <button
        type="button"
        onClick={() => setReplayKey((k) => k + 1)}
        className="self-start rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted"
      >
        Replay
      </button>
    </LiveExample>
  );
}
