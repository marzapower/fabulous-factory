"use client";

import { useState, type FormEvent } from "react";

import { authClient } from "@factory/auth/client";
import { Button } from "../primitives/button";
import { Input } from "../primitives/input";
import { Label } from "../primitives/label";
import { describeAuthError } from "./errors";

export interface ForgotPasswordFormProps {
  /** A capability read (email service configured), rendered server-side — never guessed
   * client-side, same discipline as `LoginFormProps.enabledProviders`. */
  emailEnabled: boolean;
}

/** Pure view-state decision, extracted for testing without rendering — mirrors
 * `resolveThemeClass` (`../theme/script.ts`)'s pattern in this package. */
export function resolveForgotPasswordView(emailEnabled: boolean): "disabled" | "form" {
  return emailEnabled ? "form" : "disabled";
}

export function ForgotPasswordForm({ emailEnabled }: ForgotPasswordFormProps) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState("sending");
    setError(null);

    // Better Auth's `/request-password-reset` always responds `{ status: true }`
    // whether or not the email has an account (plan §password.mjs: it simulates the
    // token-generation work either way to avoid a timing tell) — the success copy below
    // deliberately doesn't confirm account existence either.
    const { error: requestError } = await authClient.requestPasswordReset({
      email,
      redirectTo: "/reset-password",
    });

    if (requestError) {
      setState("idle");
      setError(describeAuthError(requestError, "Unable to send the reset link."));
      return;
    }

    setState("sent");
  }

  if (resolveForgotPasswordView(emailEnabled) === "disabled") {
    return (
      <div className="grid gap-2 rounded-md border border-border bg-muted px-3 py-3 text-sm">
        <p className="font-medium">Password reset isn&apos;t available</p>
        <p className="text-muted-foreground">
          Resetting a password requires email delivery, which isn&apos;t configured for this
          deployment. Contact whoever manages your account for another way in.
        </p>
      </div>
    );
  }

  if (state === "sent") {
    return (
      <p className="text-sm text-muted-foreground" role="status">
        If an account exists for {email}, we&apos;ve sent a link to reset the password. Check your
        inbox.
      </p>
    );
  }

  return (
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
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      <Button type="submit" disabled={state === "sending"}>
        {state === "sending" ? "Sending…" : "Send reset link"}
      </Button>
    </form>
  );
}
