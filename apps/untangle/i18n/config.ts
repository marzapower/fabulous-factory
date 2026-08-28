import { defineI18n } from "@factory/i18n";
import { uiCatalog } from "@factory/ui/messages";

import { appCatalog } from "../messages";

// Untangle is a single-locale preset by design (i18n plan D6): the product's own copy
// (marketing homepage, workspace, dashboard widgets) stays hardcoded English, and only
// the mechanism — the shared route shells (auth, legal, settings/dashboard, error/
// not-found) and page metadata — runs through `t()`. Adding a second locale here is
// exactly the `add-a-locale` skill's job: add `<xx>.json` next to this file's `en.json`
// entries and extend `locales` below.
export const i18n = defineI18n({
  locales: ["en"],
  defaultLocale: "en",
  catalogs: [uiCatalog, appCatalog],
});
