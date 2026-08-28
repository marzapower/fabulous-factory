"use client";

import { useState, type FormEvent } from "react";

import { useTranslations } from "@factory/i18n";
import { useLocalizedHref } from "@factory/i18n/client";
import { useRouter } from "@factory/i18n/navigation";

import { authClient } from "@factory/auth/client";
import { Button } from "../primitives/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "../primitives/card";
import { Input } from "../primitives/input";
import { Label } from "../primitives/label";
import { cn } from "../lib/utils";
import { describeAuthError } from "../auth/errors";
import { resolveDeleteAccountPlan } from "./delete-account-plan";

export interface AccountSettingsProps {
  user: {
    name: string;
    email: string;
    emailVerified: boolean;
  };
  /** Whether the email service is configured — gates the delete-account path, same
   * capability read as `ForgotPasswordFormProps.emailEnabled`. */
  emailEnabled: boolean;
  /** Whether this user has a credential (email+password) account, as opposed to
   * social-only — a server-verified fact, never guessed client-side. */
  hasPasswordAccount: boolean;
  /** Where "Download your data" points — an app route/API endpoint this component never
   * constructs itself. */
  exportHref: string;
}

export function AccountSettings({
  user,
  emailEnabled,
  hasPasswordAccount,
  exportHref,
}: AccountSettingsProps) {
  return (
    <div className="grid gap-6">
      <ProfileCard user={user} />
      <DataExportCard exportHref={exportHref} />
      <DangerZoneCard emailEnabled={emailEnabled} hasPasswordAccount={hasPasswordAccount} />
    </div>
  );
}

function ProfileCard({ user }: { user: AccountSettingsProps["user"] }) {
  const t = useTranslations("ui.account.profileCard");
  const router = useRouter();
  const [name, setName] = useState(user.name);
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState("saving");
    setError(null);

    const { error: updateError } = await authClient.updateUser({ name });

    if (updateError) {
      setState("idle");
      setError(describeAuthError(updateError, t("error")));
      return;
    }

    setState("saved");
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="grid gap-4" onSubmit={handleSubmit}>
          <div className="grid gap-2">
            <Label htmlFor="account-name">{t("nameLabel")}</Label>
            <Input
              id="account-name"
              name="name"
              type="text"
              autoComplete="name"
              required
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                setState("idle");
              }}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="account-email">{t("emailLabel")}</Label>
            <div className="flex items-center gap-2">
              <Input id="account-email" type="email" value={user.email} readOnly disabled />
              <span
                className={cn(
                  "shrink-0 rounded-md px-2 py-1 text-xs font-medium",
                  user.emailVerified
                    ? "bg-primary/10 text-primary"
                    : "bg-muted text-muted-foreground",
                )}
              >
                {user.emailVerified ? t("verified") : t("notVerified")}
              </span>
            </div>
          </div>
          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
          {state === "saved" && (
            <p className="text-sm text-muted-foreground" role="status">
              {t("saved")}
            </p>
          )}
          <Button
            type="submit"
            className="justify-self-start"
            disabled={state === "saving" || name.trim().length === 0 || name === user.name}
          >
            {state === "saving" ? t("saving") : t("saveButton")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function DataExportCard({ exportHref }: { exportHref: string }) {
  const t = useTranslations("ui.account.dataExportCard");

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardFooter>
        <a
          href={exportHref}
          className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-md border bg-background px-4 py-2 text-sm font-medium shadow-xs transition-all outline-none hover:bg-accent hover:text-accent-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:border-input dark:bg-input/30 dark:hover:bg-input/50"
        >
          {t("downloadButton")}
        </a>
      </CardFooter>
    </Card>
  );
}

type DeleteState = "idle" | "confirming" | "pending" | "email-sent";

function DangerZoneCard({
  emailEnabled,
  hasPasswordAccount,
}: {
  emailEnabled: boolean;
  hasPasswordAccount: boolean;
}) {
  const t = useTranslations("ui.account.dangerZoneCard");
  const router = useRouter();
  const localizeHref = useLocalizedHref();
  const plan = resolveDeleteAccountPlan({ hasPasswordAccount, emailEnabled });

  const [step, setStep] = useState<DeleteState>("idle");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStep("pending");
    setError(null);

    // Both axes compose into one request: the password (when collected) is verified by
    // better-auth on either path, and the callbackURL only matters on the email path —
    // see `resolveDeleteAccountPlan`'s doc comment for why success on the email path
    // means "link sent", never "deleted".
    const { error: deleteError } = await authClient.deleteUser({
      ...(plan.collectPassword ? { password } : {}),
      ...(plan.confirmation === "email" ? { callbackURL: localizeHref("/") } : {}),
    });
    if (deleteError) {
      setStep("confirming");
      setError(
        describeAuthError(
          deleteError,
          plan.confirmation === "email" ? t("emailErrorFallback") : t("immediateErrorFallback"),
        ),
      );
      return;
    }
    if (plan.confirmation === "email") {
      setStep("email-sent");
      return;
    }
    router.push("/");
    router.refresh();
  }

  return (
    <Card className="border-destructive/50">
      <CardHeader>
        <CardTitle className="text-destructive">{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent>
        {step === "email-sent" ? (
          <p className="text-sm text-muted-foreground" role="status">
            {t("emailSent")}
          </p>
        ) : step === "idle" ? (
          <Button type="button" variant="destructive" onClick={() => setStep("confirming")}>
            {t("deleteButton")}
          </Button>
        ) : (
          <form className="grid gap-4" onSubmit={handleConfirm}>
            {plan.collectPassword && (
              <div className="grid gap-2">
                <Label htmlFor="delete-password">{t("passwordLabel")}</Label>
                <Input
                  id="delete-password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </div>
            )}
            {plan.confirmation === "email" ? (
              <p className="text-sm text-muted-foreground">{t("emailConfirmationNotice")}</p>
            ) : (
              <p className="text-sm text-muted-foreground">
                {plan.collectPassword
                  ? t("immediateWithPasswordNotice")
                  : t("immediateNoPasswordNotice")}
              </p>
            )}
            {error && (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            )}
            <div className="flex gap-2">
              <Button type="submit" variant="destructive" disabled={step === "pending"}>
                {plan.confirmation === "email"
                  ? step === "pending"
                    ? t("emailConfirmSending")
                    : t("emailConfirmButton")
                  : step === "pending"
                    ? t("immediateConfirmSending")
                    : t("immediateConfirmButton")}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={step === "pending"}
                onClick={() => {
                  setStep("idle");
                  setError(null);
                  setPassword("");
                }}
              >
                {t("cancelButton")}
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
