import type { Metadata } from "next";
import { Suspense } from "react";

import { ResetPasswordForm } from "@factory/ui/auth";
import { SiteFooter } from "@factory/ui/marketing";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@factory/ui/primitives";

export const metadata: Metadata = {
  title: "Choose a new password",
  description: "Set a new password for your Untangle account.",
};

// `ResetPasswordForm` reads the reset token via `useSearchParams()`, which requires a
// `<Suspense>` boundary to prerender under the App Router — force-dynamic on top since
// the token is only meaningful per-request anyway.
export const dynamic = "force-dynamic";

export default function ResetPasswordPage() {
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
