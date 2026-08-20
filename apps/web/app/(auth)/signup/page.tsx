import Link from "next/link";

import { getCapabilities, getEnv } from "@factory/config";
import { deriveAuthOptions } from "@factory/auth";
import { SignupForm } from "@/components/auth/signup-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

// OAuth button visibility is a runtime, server-side fact (which providers have both
// client id + secret configured) — never guessed client-side (design spec §5.1).
export const dynamic = "force-dynamic";

export default function SignupPage() {
  const { enabledProviders } = deriveAuthOptions(getEnv(), getCapabilities());

  return (
    <main className="flex min-h-svh items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">Create an account</CardTitle>
          <CardDescription>Get started with Fabulous Factory.</CardDescription>
        </CardHeader>
        <CardContent>
          <SignupForm enabledProviders={enabledProviders} />
          <p className="mt-6 text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link href="/login" className="underline underline-offset-4">
              Sign in
            </Link>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
