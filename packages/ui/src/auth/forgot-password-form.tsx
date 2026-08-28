"use client";

import { useState, type FormEvent } from "react";

import { useTranslations } from "@factory/i18n";
import { useLocalizedHref } from "@factory/i18n/client";

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
  const t = useTranslations("ui.auth.forgotPasswordForm");
  const localizeHref = useLocalizedHref();
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
      redirectTo: localizeHref("/reset-password"),
    });

    if (requestError) {
      setState("idle");
      setError(describeAuthError(requestError, t("fallbackError")));
      return;
    }

    setState("sent");
  }

  if (resolveForgotPasswordView(emailEnabled) === "disabled") {
    return (
      <div className="grid gap-2 rounded-md border border-border bg-muted px-3 py-3 text-sm">
        <p className="font-medium">{t("disabledTitle")}</p>
        <p className="text-muted-foreground">{t("disabledBody")}</p>
      </div>
    );
  }

  if (state === "sent") {
    return (
      <p className="text-sm text-muted-foreground" role="status">
        {t("sentMessage", { email })}
      </p>
    );
  }

  return (
    <form className="grid gap-4" onSubmit={handleSubmit}>
      <div className="grid gap-2">
        <Label htmlFor="email">{t("emailLabel")}</Label>
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
        {state === "sending" ? t("sending") : t("sendButton")}
      </Button>
    </form>
  );
}
