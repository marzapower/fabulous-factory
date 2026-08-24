import type { Metadata } from "next";
import Link from "next/link";

import { isEnabled } from "@factory/config";
import { ForgotPasswordForm } from "@factory/ui/auth";
import { SiteFooter } from "@factory/ui/marketing";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@factory/ui/primitives";

export const metadata: Metadata = {
  title: "Reset your password",
  description: "Request a password reset link for your Fabulous Brainstorm Chat account.",
};

// Capability-conditional UI (emailEnabled) must render dynamically (design spec §5.1) —
// never guessed client-side, same discipline as the login/signup pages' provider list.
export const dynamic = "force-dynamic";

export default function ForgotPasswordPage() {
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
