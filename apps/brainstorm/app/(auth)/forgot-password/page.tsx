import type { Metadata } from "next";

import { ForgotPasswordPage } from "@factory/ui/auth";

export const metadata: Metadata = {
  title: "Reset your password",
  description: "Request a password reset link for your Fabulous Brainstorm Chat account.",
};

// Capability-conditional UI (emailEnabled) must render dynamically (design spec §5.1) —
// never guessed client-side, same discipline as the login/signup pages' provider list.
export const dynamic = "force-dynamic";

export default function ForgotPasswordRoutePage() {
  return <ForgotPasswordPage appName="Fabulous Brainstorm Chat" />;
}
