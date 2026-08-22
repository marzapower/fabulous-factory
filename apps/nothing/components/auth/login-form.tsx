"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { authClient } from "@factory/auth/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const PROVIDER_LABELS = {
  google: "Google",
  github: "GitHub",
} as const;

export interface LoginFormProps {
  /** Rendered server-side by the login page via `deriveAuthOptions` — never guessed client-side. */
  enabledProviders: ReadonlyArray<"google" | "github">;
  /** `deriveAuthOptions(...).email.magicLink` — gates the secondary sign-in-link
   * affordance; a capability read, never done from this client component itself. */
  magicLinkEnabled: boolean;
}

export function LoginForm({ enabledProviders, magicLinkEnabled }: LoginFormProps) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [socialLoading, setSocialLoading] = useState<"google" | "github" | null>(null);

  // Set when sign-in fails with Better Auth's EMAIL_NOT_VERIFIED error, so the resend
  // notice knows which address to target.
  const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null);
  const [resendState, setResendState] = useState<"idle" | "sending" | "sent">("idle");
  const [resendError, setResendError] = useState<string | null>(null);

  const [magicLinkOpen, setMagicLinkOpen] = useState(false);
  const [magicLinkEmail, setMagicLinkEmail] = useState("");
  const [magicLinkState, setMagicLinkState] = useState<"idle" | "sending" | "sent">("idle");
  const [magicLinkError, setMagicLinkError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    // Reset together — a stale 'sent'/error state from a previous unverified-email
    // notice must never leak onto a different email's notice.
    setUnverifiedEmail(null);
    setResendState("idle");
    setResendError(null);

    const { error: signInError } = await authClient.signIn.email({ email, password });

    if (signInError) {
      // Status + error code, never message matching (plan G.10.13) — verified against
      // better-auth 1.7.1's sign-in route (`APIError.from("FORBIDDEN",
      // BASE_ERROR_CODES.EMAIL_NOT_VERIFIED)`, dist/api/routes/sign-in.mjs), which the
      // client types as `{ status: 403, code: "EMAIL_NOT_VERIFIED", message }`
      // (dist/client/path-to-object.d.mts's default endpoint error shape).
      if (signInError.status === 403 && signInError.code === "EMAIL_NOT_VERIFIED") {
        setUnverifiedEmail(email);
        setLoading(false);
        return;
      }
      setError(signInError.message ?? "Unable to sign in. Check your email and password.");
      setLoading(false);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  async function handleSocial(provider: "google" | "github") {
    setSocialLoading(provider);
    setError(null);
    const { error: socialError } = await authClient.signIn.social({
      provider,
      callbackURL: "/dashboard",
    });
    if (socialError) {
      setError(socialError.message ?? `Unable to sign in with ${PROVIDER_LABELS[provider]}.`);
      setSocialLoading(null);
    }
  }

  async function handleResendVerification() {
    if (!unverifiedEmail) return;
    setResendState("sending");
    setResendError(null);

    const { error: sendError } = await authClient.sendVerificationEmail({
      email: unverifiedEmail,
      callbackURL: "/dashboard",
    });

    if (sendError) {
      setResendState("idle");
      setResendError(sendError.message ?? "Unable to resend the verification email.");
      return;
    }

    setResendState("sent");
  }

  async function handleMagicLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMagicLinkState("sending");
    setMagicLinkError(null);

    const { error: magicError } = await authClient.signIn.magicLink({
      email: magicLinkEmail,
      callbackURL: "/dashboard",
    });

    if (magicError) {
      setMagicLinkState("idle");
      setMagicLinkError(magicError.message ?? "Unable to send a sign-in link.");
      return;
    }

    setMagicLinkState("sent");
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
            autoComplete="current-password"
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
          {loading ? "Signing in…" : "Sign in"}
        </Button>
      </form>

      {unverifiedEmail && (
        <div className="grid gap-2 rounded-md border border-border bg-muted px-3 py-3 text-sm">
          <p>Your email isn&apos;t verified yet. Verify it to sign in.</p>
          {resendState === "sent" ? (
            <p className="text-muted-foreground">
              Verification email sent — check your inbox at {unverifiedEmail}.
            </p>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="justify-self-start"
              disabled={resendState === "sending"}
              onClick={handleResendVerification}
            >
              {resendState === "sending" ? "Sending…" : "Resend verification email"}
            </Button>
          )}
          {resendError && (
            <p className="text-destructive" role="alert">
              {resendError}
            </p>
          )}
        </div>
      )}

      {magicLinkEnabled && (
        <div className="grid gap-2 text-sm">
          {!magicLinkOpen ? (
            <button
              type="button"
              className="justify-self-center text-muted-foreground underline underline-offset-4 hover:text-foreground"
              onClick={() => {
                setMagicLinkOpen(true);
                setMagicLinkEmail(email);
              }}
            >
              Email me a sign-in link instead
            </button>
          ) : magicLinkState === "sent" ? (
            <p className="text-center text-muted-foreground">
              Sign-in link sent — check your inbox at {magicLinkEmail}.
            </p>
          ) : (
            <form className="grid gap-2" onSubmit={handleMagicLink}>
              <Label htmlFor="magic-link-email" className="sr-only">
                Email
              </Label>
              <div className="flex gap-2">
                <Input
                  id="magic-link-email"
                  type="email"
                  required
                  placeholder="you@example.com"
                  value={magicLinkEmail}
                  onChange={(event) => setMagicLinkEmail(event.target.value)}
                />
                <Button type="submit" variant="outline" disabled={magicLinkState === "sending"}>
                  {magicLinkState === "sending" ? "Sending…" : "Send link"}
                </Button>
              </div>
              {magicLinkError && (
                <p className="text-destructive" role="alert">
                  {magicLinkError}
                </p>
              )}
            </form>
          )}
        </div>
      )}
    </div>
  );
}
