import type { Metadata } from "next";

import { hasCredentialAccount, requireSession } from "@factory/auth";
import { isEnabled } from "@factory/config";
import { AccountSettings } from "@factory/ui/account";
import { SiteFooter } from "@factory/ui/marketing";

export const metadata: Metadata = {
  title: "Account settings",
  description: "Manage your Fabulous Brainstorm Chat account.",
};

// Capability-conditional UI must render dynamically (design spec §5.1), and this page's
// contents are gated on a live session lookup besides — never statically prerendered,
// same discipline as the dashboard page.
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await requireSession({ redirectTo: "/login" });
  const hasPasswordAccount = await hasCredentialAccount(session.user.id);

  return (
    <div className="fab-shell flex min-h-svh flex-col">
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-6 py-12">
        <AccountSettings
          user={{
            name: session.user.name,
            email: session.user.email,
            emailVerified: session.user.emailVerified,
          }}
          emailEnabled={isEnabled("email")}
          hasPasswordAccount={hasPasswordAccount}
          exportHref="/api/account/export"
        />
      </main>

      <SiteFooter />
    </div>
  );
}
