"use client";

import { useTranslations } from "@factory/i18n";
import { Link } from "@factory/i18n/navigation";

import { buttonVariants } from "@factory/ui/primitives";
import { FeedbackShell } from "@factory/ui/feedback";

/**
 * Route-segment error boundary — catches a thrown render/data error anywhere under this
 * layout and swaps it for this page instead of Next's unstyled default. `error.message`
 * is never shown: Next already redacts server error messages in production, and even in
 * dev this file must not become a second place that leaks details `pnpm check`'s other
 * gates would catch — `error.digest` (a stable, opaque id Next attaches server-side) is
 * the only identifying detail surfaced, and only when present. Nothing is logged here
 * either — Next already reports the error to the server log; a second `console.error`
 * would just risk echoing whatever the error object happens to carry.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("app.errorPage");

  return (
    <FeedbackShell
      glyph="✕"
      title={t("title")}
      message={t("message")}
      detail={error.digest ? t("ref", { digest: error.digest }) : undefined}
      action={
        <button type="button" onClick={reset} className={buttonVariants({ size: "sm" })}>
          {t("tryAgain")}
        </button>
      }
      secondaryAction={
        <Link href="/" className={buttonVariants({ variant: "outline", size: "sm" })}>
          {t("goHome")}
        </Link>
      }
    />
  );
}
