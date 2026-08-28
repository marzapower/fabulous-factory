import { defineI18n } from "@factory/i18n";
import { uiCatalog } from "@factory/ui/messages";

import { appCatalog } from "../messages";

// Two declared locales, "en" default (D6: apps/nothing ships en + it). No off switch —
// D4: a single-locale app is the degraded state, not this one.
export const i18n = defineI18n({
  locales: ["en", "it"],
  defaultLocale: "en",
  catalogs: [uiCatalog, appCatalog],
});
