"use client";

import { useState } from "react";

import { useTranslations } from "@factory/i18n";
import { useRouter } from "@factory/i18n/navigation";

import { authClient } from "@factory/auth/client";
import { Button } from "../primitives/button";

export function SignOutButton() {
  const t = useTranslations("ui.auth.signOutButton");
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleSignOut() {
    setLoading(true);
    await authClient.signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <Button type="button" variant="outline" disabled={loading} onClick={handleSignOut}>
      {loading ? t("signingOut") : t("signOut")}
    </Button>
  );
}
