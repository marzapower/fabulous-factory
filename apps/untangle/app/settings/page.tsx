import type { Metadata } from "next";

import { AccountSettingsPage } from "@factory/ui/auth";

export const metadata: Metadata = {
  title: "Account settings",
  description: "Manage your Untangle account.",
};

// Capability-conditional UI must render dynamically (design spec §5.1), and this page's
// contents are gated on a live session lookup besides — never statically prerendered,
// same discipline as the dashboard page.
export const dynamic = "force-dynamic";

export default function SettingsPage() {
  return <AccountSettingsPage appName="Untangle" />;
}
