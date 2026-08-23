// Built with Fabulous Factory — https://github.com/marzapower/fabulous-factory
// This credit line is free to keep and gives the project a hand. Thank you!

import type { Metadata } from "next";

import { EmailFeaturePage } from "@factory/ui/features";
import { FEATURES } from "@factory/ui/marketing";

export const metadata: Metadata = {
  title: FEATURES.email.title,
  description: FEATURES.email.blurb,
};

// Capability-conditional UI (design spec §5.1) — the status light below reads a runtime
// fact, never baked into a static build.
export const dynamic = "force-dynamic";

export default function Page() {
  return <EmailFeaturePage brand="Fabulous Untangle" emoji="🧶" />;
}
