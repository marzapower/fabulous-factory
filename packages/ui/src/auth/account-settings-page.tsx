import { localizedHref } from "@factory/i18n/server";

import { hasCredentialAccount, requireSession } from "@factory/auth";
import { isEnabled } from "@factory/config";

import { AccountSettings } from "../account";
import { SiteFooter } from "../marketing";

export interface AccountSettingsPageProps {
  /** Used only for the surrounding shell today — kept for parity with the other two
   * shared auth pages and in case a per-app greeting is added later. */
  appName: string;
}

/**
 * Shared account settings page body for every preset app. Session-fetch and
 * capability-check logic (live `requireSession` + `hasCredentialAccount` lookups, the
 * `isEnabled("email")` capability gate) lives here; each app's own `app/settings/page.tsx`
 * keeps its own `export const metadata` (Next.js requires that to live in the app's own
 * file) and delegates its default export's body to this component.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- appName reserved for a future per-app greeting; kept in the signature so every call site already passes it.
export async function AccountSettingsPage({ appName }: AccountSettingsPageProps) {
  const session = await requireSession({ redirectTo: await localizedHref("/login") });
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
