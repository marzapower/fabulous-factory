import type { ReactNode } from "react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../primitives/card";
import { cn } from "../lib/utils";

export interface FeedbackShellProps {
  /**
   * Single glyph rendered in a small mono status box ahead of the title — reuses the
   * codebase's own glyph-coded status idiom (`apps/untangle/app/runs/page.tsx`'s
   * `STEP_STATUS_GLYPH`) instead of reaching for an icon library, so an error/empty/
   * not-found page reads as one more state in the same log rather than a generic
   * illustrated error screen. Purely decorative — `aria-hidden`.
   */
  glyph?: string;
  title: string;
  message: string;
  /**
   * Small monospace line for a digest/detail (e.g. Next's `error.digest`). Never pass a
   * raw error message here — see the `error.tsx` call sites, which show only Next's own
   * opaque digest, not `err.message`.
   */
  detail?: string;
  action?: ReactNode;
  secondaryAction?: ReactNode;
  className?: string;
}

/**
 * Shared presentational shell for error / not-found / empty-state pages across every
 * preset app. Purely presentational — no client-side state, no "use client" needed —
 * every app's error.tsx/not-found.tsx wraps it with whatever interactivity (retry,
 * links) it needs. Built entirely from `@factory/ui/primitives` + the shared tokens in
 * `styles/base.css`, so it stays dark-ready for free and never hardcodes a color.
 */
export function FeedbackShell({
  glyph = "·",
  title,
  message,
  detail,
  action,
  secondaryAction,
  className,
}: FeedbackShellProps) {
  const hasFooter = Boolean(detail || action || secondaryAction);

  return (
    <div className={cn("flex min-h-svh flex-col items-center justify-center p-6", className)}>
      <Card className="w-full max-w-sm text-center">
        <CardHeader className="items-center justify-items-center gap-3">
          <span
            aria-hidden="true"
            className="flex size-9 items-center justify-center rounded-md border border-border font-mono text-sm text-muted-foreground"
          >
            {glyph}
          </span>
          <div className="flex flex-col gap-1.5">
            <CardTitle className="text-lg">{title}</CardTitle>
            <CardDescription>{message}</CardDescription>
          </div>
        </CardHeader>
        {hasFooter ? (
          <CardContent className="flex flex-col items-center gap-3">
            {detail ? (
              <p className="font-mono text-xs break-all text-muted-foreground/80">{detail}</p>
            ) : null}
            {action || secondaryAction ? (
              <div className="flex flex-wrap items-center justify-center gap-2">
                {action}
                {secondaryAction}
              </div>
            ) : null}
          </CardContent>
        ) : null}
      </Card>
    </div>
  );
}
