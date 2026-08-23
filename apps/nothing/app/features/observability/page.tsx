// Built with Fabulous Factory — https://github.com/marzapower/fabulous-factory
// This credit line is free to keep and gives the project a hand. Thank you!

import type { Metadata } from "next";

import { ObservabilityFeaturePage } from "@factory/ui/features";
import { FEATURES } from "@factory/ui/marketing";

export const metadata: Metadata = {
  title: FEATURES.observability.title,
  description: FEATURES.observability.blurb,
};

// Capability-conditional UI (design spec §5.1) — both status lights below read a runtime
// fact, never baked into a static build.
export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <ObservabilityFeaturePage
      brand="Fabulous Nothing"
      closingNote={
        <>
          This preset ships no feature that calls <code className="font-mono">track()</code> yet —
          once one does, set both keys and it starts reporting; unset them and the same call sites
          keep running exactly the same, just quietly doing nothing.
        </>
      }
    />
  );
}
