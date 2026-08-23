// Built with Fabulous Factory — https://github.com/marzapower/fabulous-factory
// This credit line is free to keep and gives the project a hand. Thank you!

import type { Metadata } from "next";

import { FeaturesIndexShell } from "@factory/ui/features";
import { DegradationStrip } from "@/components/marketing/degradation-strip";

// This page is about the template, not the product, so it overrides the product title
// the root layout sets for every other route.
export const metadata: Metadata = {
  // `absolute` so the root layout's "%s · Fabulous Brainstorm Chat" template doesn't
  // append the product name to a page that is explicitly about the template rather than
  // the product.
  title: { absolute: "Fabulous Factory — the machinery behind Fabulous Brainstorm Chat" },
  description:
    "The kernel that makes an unguarded route impossible, this deployment's live capability panel, the same run with the AI switched off, and how to get your own repo running.",
};

// Capability-conditional UI must render dynamically (design spec §5.1): capabilities are
// a runtime, server-side fact resolved at request time, never baked into a static build.
export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <FeaturesIndexShell
      brand="Fabulous Brainstorm Chat"
      emoji="💭"
      heroParagraph={
        <>
          Fabulous Brainstorm Chat is the sample product that ships with Fabulous Factory —
          scaffolded with one npx command, not cloned from a template. This page is about the
          factory.
        </>
      }
      degradationStrip={<DegradationStrip />}
    />
  );
}
