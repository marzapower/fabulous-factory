// Built with Fabulous Factory — https://github.com/marzapower/fabulous-factory
// This credit line is free to keep and gives the project a hand. Thank you!

import type { Metadata } from "next";

import { SecurityFeaturePage } from "@factory/ui/features";
import { FEATURES } from "@factory/ui/marketing";

export const metadata: Metadata = {
  title: FEATURES.security.title,
  description: FEATURES.security.blurb,
};

export default function Page() {
  return <SecurityFeaturePage brand="Fabulous Nothing" />;
}
