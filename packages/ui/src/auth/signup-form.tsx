"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { authClient } from "@factory/auth/client";
import { Button } from "../primitives/button";
import { Input } from "../primitives/input";
import { Label } from "../primitives/label";
import { cn } from "../lib/utils";

const PROVIDER_LABELS = {
  google: "Google",
  github: "GitHub",
} as const;

export interface SignupFormProps {
  /** Rendered server-side by the signup page via `deriveAuthOptions` — never guessed client-side. */
  enabledProviders: ReadonlyArray<"google" | "github">;
}

export function SignupForm({ enabledProviders }: SignupFormProps) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [socialLoading, setSocialLoading] = useState<"google" | "github" | null>(null);
  const [verifyPending, setVerifyPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const { data, error: signUpError } = await authClient.signUp.email({ email, password, name });

    if (signUpError) {
      setError(signUpError.message ?? "Unable to create your account.");
      setLoading(false);
      return;
    }

    // Better Auth's `/sign-up/email` returns `{ token: null, user }` — no active session —
    // when `requireEmailVerification` is on (plan E.9.1: verified against better-auth
    // 1.7.1's `signUpEmail` endpoint types, `dist/api/routes/sign-up.d.mts`), and
    // `{ token: string, user }` with a session cookie already set when it's off (email
    // disabled — the honest §5.2 fallback). Branch on that returned shape, never on a
    // client-side capability read: pushing to `/dashboard` with no session would just
    // bounce straight back to `/login` via `requireSession()`.
    if (!data?.token) {
      setLoading(false);
      setVerifyPending(true);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  if (verifyPending) {
    return (
      <div className="grid gap-2 text-center">
        <p className="text-sm font-medium">Check your email to verify your account</p>
        <p className="text-sm text-muted-foreground">
          We sent a verification link to {email}. Click it to finish setting up your account.
        </p>
      </div>
    );
  }

  async function handleSocial(provider: "google" | "github") {
    setSocialLoading(provider);
    setError(null);
    const { error: socialError } = await authClient.signIn.social({
      provider,
      callbackURL: "/dashboard",
    });
    if (socialError) {
      setError(socialError.message ?? `Unable to sign up with ${PROVIDER_LABELS[provider]}.`);
      setSocialLoading(null);
    }
  }

  return (
    <div className="grid gap-6">
      {enabledProviders.length > 0 && (
        <div className="grid gap-2">
          {enabledProviders.map((provider) => (
            <Button
              key={provider}
              type="button"
              variant="outline"
              disabled={socialLoading !== null}
              onClick={() => handleSocial(provider)}
            >
              {socialLoading === provider
                ? "Redirecting…"
                : `Continue with ${PROVIDER_LABELS[provider]}`}
            </Button>
          ))}
          <div className="relative py-2 text-center text-sm text-muted-foreground">
            <span className="bg-card relative z-10 px-2">or continue with email</span>
            <div className="absolute inset-x-0 top-1/2 border-t" aria-hidden="true" />
          </div>
        </div>
      )}

      <form className="grid gap-4" onSubmit={handleSubmit}>
        <div className="grid gap-2">
          <Label htmlFor="name">Name</Label>
          <Input
            id="name"
            name="name"
            type="text"
            autoComplete="name"
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </div>
        {error && (
          <p className={cn("text-sm text-destructive")} role="alert">
            {error}
          </p>
        )}
        <Button type="submit" disabled={loading}>
          {loading ? "Creating account…" : "Create account"}
        </Button>
      </form>
    </div>
  );
}
