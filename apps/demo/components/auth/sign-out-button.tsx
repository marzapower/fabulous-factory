"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { authClient } from "@factory/auth/client";
import { Button } from "@/components/ui/button";

export function SignOutButton() {
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
      {loading ? "Signing out…" : "Sign out"}
    </Button>
  );
}
