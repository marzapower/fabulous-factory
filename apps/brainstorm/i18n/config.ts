import { defineI18n } from "@factory/i18n";
import { uiCatalog } from "@factory/ui/messages";

import { appCatalog } from "../messages";

// Single locale today (plan D6): this preset keeps its product-specific copy hardcoded
// English rather than exercising the switcher — the mechanism is present (this file,
// the catalog merge, the proxy composition below), not the second locale.
export const i18n = defineI18n({
  locales: ["en"],
  defaultLocale: "en",
  catalogs: [uiCatalog, appCatalog],
});
