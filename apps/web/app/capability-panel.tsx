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
    <section style={{ marginTop: "2rem" }}>
      <h2 style={{ fontSize: "1.1rem", marginBottom: "0.75rem" }}>Capabilities</h2>
      <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: "0.4rem" }}>
        {(Object.keys(SERVICE_LABELS) as Array<keyof typeof SERVICE_LABELS>).map((service) => {
          const enabled = capabilities[service];
          return (
            <li
              key={service}
              style={{
                display: "flex",
                justifyContent: "space-between",
                padding: "0.5rem 0.75rem",
                borderRadius: 6,
                background: enabled ? "#e8f7ee" : "#f4f4f5",
                color: enabled ? "#1a7f43" : "#71717a",
              }}
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
