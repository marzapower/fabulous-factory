"use client";

import { useClientConfig } from "@factory/config/client";

// Keys must match the ServiceName union from @factory/config exactly (billing, llm,
// email, jobs, analytics, errors). Only on/off booleans are shown here — adapter
// identities (e.g. 'stripe', 'sentry') are recon data and never cross the server
// boundary (design spec §12).
const SERVICE_LABELS = {
  billing: "Billing",
  llm: "LLM",
  email: "Email",
  jobs: "Jobs",
  analytics: "Analytics",
  errors: "Errors",
} as const;

export function CapabilityPanel() {
  const { capabilities } = useClientConfig();

  return (
    <section className="mt-8">
      <h2 className="mb-3 text-lg font-semibold">Capabilities</h2>
      <ul className="grid gap-2">
        {(Object.keys(SERVICE_LABELS) as Array<keyof typeof SERVICE_LABELS>).map((service) => {
          const enabled = capabilities[service];
          return (
            <li
              key={service}
              className={
                enabled
                  ? "flex items-center justify-between rounded-md bg-primary/10 px-3 py-2 text-sm text-primary"
                  : "flex items-center justify-between rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground"
              }
            >
              <span>{SERVICE_LABELS[service]}</span>
              <span>{enabled ? "Enabled" : "Disabled"}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
