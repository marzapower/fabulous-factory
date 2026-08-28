import en from "./en.json";

import type { Catalog } from "@factory/i18n";

// Namespace "app" — merged by this app's defineI18n() call (i18n/config.ts) alongside
// @factory/ui's "ui" catalog. Untangle declares `locales: ["en"]` only (i18n plan D6),
// so there is no `it.json` here yet — `messagesFor()` never needs a non-default-locale
// entry to fall back from.
export const appCatalog: Catalog<"app"> = {
  namespace: "app",
  messages: { en },
};

declare module "@factory/i18n" {
  interface MessageRegistry {
    app: typeof en;
  }
}
