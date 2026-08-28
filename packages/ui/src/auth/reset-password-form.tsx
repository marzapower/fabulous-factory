"use client";

import { useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";

import { useTranslations } from "@factory/i18n";
import { Link } from "@factory/i18n/navigation";

import { authClient } from "@factory/auth/client";
import { Button } from "../primitives/button";
import { Input } from "../primitives/input";
import { Label } from "../primitives/label";
import { describeAuthError } from "./errors";

/**
 * Reads the reset token straight from the URL — Better Auth's GET `/reset-password/:token`
 * callback (hit before this page ever renders) redirects here with `?token=<value>` on a
 * valid token, or `?error=INVALID_TOKEN` on an invalid/expired one (verified against
 * better-auth 1.7.1's `requestPasswordResetCallback`,
 * `dist/api/routes/password.mjs`). Never posted from a client-typed field.
 *
 * The caller must render this inside a `<Suspense>` boundary — `useSearchParams()`
 * requires one for the page to prerender (Next.js App Router constraint, not specific to
 * this component).
 */
/** Pure view-state decision, extracted for testing without rendering — mirrors
 * `resolveThemeClass` (`../theme/script.ts`)'s pattern in this package. A missing token
 * covers both "never had one" and the invalid/expired `?error=INVALID_TOKEN` redirect —
 * either way there's nothing to submit. */
export function resolveResetPasswordView(token: string | null): "invalid" | "form" {
  return token ? "form" : "invalid";
}

export function ResetPasswordForm() {
  const t = useTranslations("ui.auth.resetPasswordForm");
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (resolveResetPasswordView(token) === "invalid") {
    return (
      <p className="text-sm text-destructive" role="alert">
        {t("invalidMessage")}{" "}
        <Link href="/forgot-password" className="underline underline-offset-4">
          {t("requestNewOne")}
        </Link>
        .
      </p>
    );
  }

  if (done) {
    return (
      <div className="grid gap-2 text-center">
        <p className="text-sm font-medium" role="status">
          {t("doneMessage")}
        </p>
        <Link href="/login" className="text-sm underline underline-offset-4">
          {t("signIn")}
        </Link>
      </div>
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (newPassword !== confirmPassword) {
      setError(t("mismatchError"));
      return;
    }

    setLoading(true);
    setError(null);

    const { error: resetError } = await authClient.resetPassword({
      newPassword,
      // Non-null: the `!token` branch above returns before this closure can run.
      token: token as string,
    });

    if (resetError) {
      setLoading(false);
      setError(describeAuthError(resetError, t("fallbackError")));
      return;
    }

    setLoading(false);
    setDone(true);
  }

  return (
    <form className="grid gap-4" onSubmit={handleSubmit}>
      <div className="grid gap-2">
        <Label htmlFor="new-password">{t("newPasswordLabel")}</Label>
        <Input
          id="new-password"
          name="newPassword"
          type="password"
          autoComplete="new-password"
          required
          value={newPassword}
          onChange={(event) => setNewPassword(event.target.value)}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="confirm-password">{t("confirmPasswordLabel")}</Label>
        <Input
          id="confirm-password"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          required
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
        />
      </div>
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      <Button type="submit" disabled={loading}>
        {loading ? t("resetting") : t("submitButton")}
      </Button>
    </form>
  );
}
