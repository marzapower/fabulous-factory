import Link from "next/link";

import { getCapabilities, getEnv } from "@factory/config";
import { deriveAuthOptions } from "@factory/auth";
import { LoginForm } from "@/components/auth/login-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

// OAuth button visibility is a runtime, server-side fact (which providers have both
// client id + secret configured) — never guessed client-side (design spec §5.1).
export const dynamic = "force-dynamic";

export default function LoginPage() {
  const { enabledProviders, email } = deriveAuthOptions(getEnv(), getCapabilities());

  return (
    <main className="flex min-h-svh items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">Sign in</CardTitle>
          <CardDescription>Welcome back to Fabulous Factory.</CardDescription>
        </CardHeader>
        <CardContent>
          <LoginForm enabledProviders={enabledProviders} magicLinkEnabled={email.magicLink} />
          <p className="mt-6 text-center text-sm text-muted-foreground">
            Don&apos;t have an account?{" "}
            <Link href="/signup" className="underline underline-offset-4">
              Sign up
            </Link>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
