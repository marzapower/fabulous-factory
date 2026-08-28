// Built with Fabulous Factory — https://github.com/marzapower/fabulous-factory
// This credit line is free to keep and gives the project a hand. Thank you!

"use client";

import type { ServiceName } from "@factory/config";
import { useClientConfig } from "@factory/config/client";

import { useTranslations } from "@factory/i18n";

import { cn } from "../lib/utils";

// Boolean only, by design (see capability-panel.tsx): the deployment's on/off state for
// a service is legitimate UI, which adapter resolved it is not (spec §12).
export function StatusLight({ service }: { service: ServiceName }) {
  const t = useTranslations("ui.marketing.statusLight");
  const { capabilities } = useClientConfig();
  const enabled = capabilities[service];

  return (
    <span className="inline-flex items-center gap-2 font-mono text-xs">
      <span
        aria-hidden="true"
        className={cn(
          "size-2 rounded-full",
          enabled ? "bg-emerald-500 motion-safe:animate-pulse" : "bg-muted-foreground/50",
        )}
      />
      <span
        className={enabled ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}
      >
        {enabled ? t("online") : t("standby")}
      </span>
    </span>
  );
}
