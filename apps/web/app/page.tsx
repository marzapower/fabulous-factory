import { getClientConfig } from "@factory/config";
import { ClientConfigProvider } from "@factory/config/client";

import { CapabilityPanel } from "./capability-panel";

// Capability-conditional UI must render dynamically (design spec §5.1): capabilities are
// a runtime, server-side fact resolved at request time, never baked into a static build.
export const dynamic = "force-dynamic";

export default function HomePage() {
  const config = getClientConfig();

  return (
    <ClientConfigProvider config={config}>
      <main
        style={{
          maxWidth: 640,
          margin: "0 auto",
          padding: "3rem 1.5rem",
          fontFamily: "system-ui, -apple-system, sans-serif",
        }}
      >
        <h1 style={{ fontSize: "1.75rem", marginBottom: "0.5rem" }}>Fabulous Factory</h1>
        <p style={{ fontSize: "1.05rem", lineHeight: 1.5, color: "#444" }}>
          The human states intent, the agents do the work, the repository enforces the rules.
        </p>
        <CapabilityPanel />
      </main>
    </ClientConfigProvider>
  );
}
