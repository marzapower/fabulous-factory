import { useTranslations } from "@factory/i18n";
import { Link } from "@factory/i18n/navigation";

import { buttonVariants } from "@factory/ui/primitives";
import { FeedbackShell } from "@factory/ui/feedback";

/**
 * Next statically prerenders this route (see `app/[locale]/layout.tsx`'s root-layout
 * comment on `/_not-found`) — no session/config read here, just the shell + a link
 * home. Whether the visitor is signed in isn't knowable at this render, so "home" is
 * always `/`, never a guess at `/dashboard`. Rendered both by the `[...rest]` catch-all
 * and by explicit `notFound()` calls in already-locale-resolved pages (i18n plan §2.3) —
 * either way, `setRequestLocale` has already run earlier in the same request, so this
 * file needs none of its own.
 */
export default function NotFound() {
  const t = useTranslations("app.notFoundPage");

  return (
    <FeedbackShell
      glyph="404"
      title={t("title")}
      message={t("message")}
      action={
        <Link href="/" className={buttonVariants({ size: "sm" })}>
          {t("goHome")}
        </Link>
      }
    />
  );
}
