// Built with Fabulous Factory — https://github.com/marzapower/fabulous-factory
// This credit line is free to keep and gives the project a hand. Thank you!

"use client";

import type { ServiceName } from "@factory/config";

import { StatusLight } from "./status-light";

// Order and labels match the control-room "station" framing (design brief) — one row per
// `ServiceName`, read live from this deployment's runtime via `StatusLight`.
const STATIONS: ReadonlyArray<{ key: ServiceName; label: string }> = [
  { key: "billing", label: "Billing" },
  { key: "llm", label: "LLM" },
  { key: "jobs", label: "Jobs" },
  { key: "email", label: "Email" },
  { key: "analytics", label: "Analytics" },
  { key: "errors", label: "Error tracking" },
];

export function ControlPanel() {
  return (
    <div className="fab-panel rounded-xl border border-border bg-card p-6 shadow-sm">
      <div className="mb-3 flex items-center justify-between border-b border-border pb-3 font-mono text-xs tracking-wide text-muted-foreground uppercase">
        <span>factory/status</span>
        <span>· live</span>
      </div>

      <ul className="flex flex-col">
        {STATIONS.map((station) => (
          <li
            key={station.key}
            className="fab-station flex items-center justify-between border-b border-border/60 py-2.5 last:border-b-0"
          >
            <span className="text-sm font-medium text-foreground">{station.label}</span>
            <StatusLight service={station.key} />
          </li>
        ))}
      </ul>

      <p className="mt-4 border-t border-border pt-4 font-mono text-xs text-muted-foreground">
        Live from this deployment&rsquo;s runtime — unset an env var and a station goes to standby.
        Nothing breaks.
      </p>
    </div>
  );
}
