import Link from "next/link";

import { isEnabled } from "@factory/config";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../primitives";
import { SiteFooter } from "../marketing";
import { ForgotPasswordForm } from "./forgot-password-form";

export interface ForgotPasswordPageProps {
  /** Used only for the surrounding shell today — kept for parity with the other two
   * shared auth pages and in case per-app copy is added later. */
  appName: string;
}

/**
 * Shared "reset your password" page body for every preset app. Keeps the live
 * `isEnabled("email")` capability check (design spec §5.1: capability-conditional UI must
 * render dynamically, never guessed client-side). Each app's own
 * `app/(auth)/forgot-password/page.tsx` keeps its own `export const metadata` (Next.js
 * requires that to live in the app's own file) and re-exports `export const dynamic =
 * "force-dynamic"`, delegating its default export's body to this component.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- appName reserved for future per-app copy; kept in the signature so every call site already passes it.
export function ForgotPasswordPage({ appName }: ForgotPasswordPageProps) {
  const emailEnabled = isEnabled("email");

  return (
    <div className="fab-shell flex min-h-svh flex-col">
      <main className="flex flex-1 items-center justify-center p-6">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle className="text-xl">Reset your password</CardTitle>
            <CardDescription>We&apos;ll email you a link to choose a new one.</CardDescription>
          </CardHeader>
          <CardContent>
            <ForgotPasswordForm emailEnabled={emailEnabled} />
            <p className="mt-6 text-center text-sm text-muted-foreground">
              Remembered it?{" "}
              <Link href="/login" className="underline underline-offset-4">
                Sign in
              </Link>
            </p>
          </CardContent>
        </Card>
      </main>

      <SiteFooter />
    </div>
  );
}
