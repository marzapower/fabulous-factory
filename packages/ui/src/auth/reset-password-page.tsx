import { Suspense } from "react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../primitives";
import { SiteFooter } from "../marketing";
import { ResetPasswordForm } from "./reset-password-form";

export interface ResetPasswordPageProps {
  /** Used only for the surrounding shell today — kept for parity with the other two
   * shared auth pages and in case per-app copy is added later. */
  appName: string;
}

/**
 * Shared "choose a new password" page body for every preset app. `ResetPasswordForm`
 * reads the reset token via `useSearchParams()`, which requires the `<Suspense>` boundary
 * kept here to prerender under the App Router. Each app's own
 * `app/(auth)/reset-password/page.tsx` keeps its own `export const metadata` (Next.js
 * requires that to live in the app's own file) and re-exports `export const dynamic =
 * "force-dynamic"`, delegating its default export's body to this component.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- appName reserved for future per-app copy; kept in the signature so every call site already passes it.
export function ResetPasswordPage({ appName }: ResetPasswordPageProps) {
  return (
    <div className="fab-shell flex min-h-svh flex-col">
      <main className="flex flex-1 items-center justify-center p-6">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle className="text-xl">Choose a new password</CardTitle>
            <CardDescription>Pick something you haven&apos;t used before.</CardDescription>
          </CardHeader>
          <CardContent>
            <Suspense fallback={null}>
              <ResetPasswordForm />
            </Suspense>
          </CardContent>
        </Card>
      </main>

      <SiteFooter />
    </div>
  );
}
