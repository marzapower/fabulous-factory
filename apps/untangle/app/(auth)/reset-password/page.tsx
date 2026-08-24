import type { Metadata } from "next";

import { ResetPasswordPage } from "@factory/ui/auth";

export const metadata: Metadata = {
  title: "Choose a new password",
  description: "Set a new password for your Untangle account.",
};

// `ResetPasswordForm` reads the reset token via `useSearchParams()`, which requires a
// `<Suspense>` boundary to prerender under the App Router — force-dynamic on top since
// the token is only meaningful per-request anyway.
export const dynamic = "force-dynamic";

export default function ResetPasswordRoutePage() {
  return <ResetPasswordPage appName="Untangle" />;
}
