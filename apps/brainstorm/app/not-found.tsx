import Link from "next/link";

import { buttonVariants } from "@factory/ui/primitives";
import { FeedbackShell } from "@factory/ui/feedback";

/**
 * Next statically prerenders this route (see `app/layout.tsx`'s root-layout comment on
 * `/_not-found`) — no session/config read here, just the shell + a link home. Whether
 * the visitor is signed in isn't knowable at this render, so "home" is always `/`, never
 * a guess at `/dashboard`.
 */
export default function NotFound() {
  return (
    <FeedbackShell
      glyph="404"
      title="Nothing here"
      message="That page doesn't exist, or it moved."
      action={
        <Link href="/" className={buttonVariants({ size: "sm" })}>
          Go home
        </Link>
      }
    />
  );
}
