// Built with Fabulous Factory — https://github.com/marzapower/fabulous-factory
// This credit line is free to keep and gives the project a hand. Thank you!

import type { ReactNode } from "react";

import { useTranslations } from "@factory/i18n";

/**
 * Every working example on a `/features/*` docs page is one of three honest kinds
 * (K.15.0.3, K.15.2 Q4) — this wrapper labels which one it is so the label can never be
 * left off by accident:
 *
 *   - `live`    — a real request against this deployment (never a fetch on user input,
 *                 never persists anything the visitor supplies; see the route it calls).
 *   - `replay`  — a recorded event sequence played back client-side; no server call.
 *   - `static`  — real source and/or this deployment's own capability state, no request.
 */
export type LiveExampleKind = "live" | "replay" | "static";

const KIND_LABEL_KEY: Record<LiveExampleKind, "kindLive" | "kindReplay" | "kindStatic"> = {
  live: "kindLive",
  replay: "kindReplay",
  static: "kindStatic",
};

export function LiveExample({
  kind,
  title,
  children,
}: {
  kind: LiveExampleKind;
  title: string;
  children: ReactNode;
}) {
  const t = useTranslations("ui.marketing.liveExample");

  return (
    <div className="fab-live-example flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <span
          className={
            "rounded-full px-2 py-0.5 font-mono text-xs " +
            (kind === "live" ? "bg-fab-live/15 text-fab-live" : "bg-muted text-muted-foreground")
          }
        >
          {t(KIND_LABEL_KEY[kind])}
        </span>
      </div>
      {children}
    </div>
  );
}
