// Built with Fabulous Factory — https://github.com/marzapower/fabulous-factory
// This credit line is free to keep and gives the project a hand. Thank you!

"use client";

import { useClientConfig } from "@factory/config/client";

/** Renders the client-safe capability booleans only — never an adapter identity. */
export function CapabilityMap() {
  const { capabilities } = useClientConfig();
  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-2 font-mono text-sm sm:grid-cols-3">
      {(Object.entries(capabilities) as Array<[string, boolean]>).map(([service, enabled]) => (
        <div
          key={service}
          className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2"
        >
          <dt className="text-muted-foreground">{service}</dt>
          <dd
            className={enabled ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}
          >
            {enabled ? "on" : "off"}
          </dd>
        </div>
      ))}
    </dl>
  );
}
