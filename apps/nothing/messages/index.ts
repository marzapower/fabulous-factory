import en from "./en.json";
import it from "./it.json";

import type { Catalog } from "@factory/i18n";

// Namespace "app" — this preset's own copy (moved shared pages + page metadata), merged
// by defineI18n() alongside packages/ui's "ui" catalog.
export const appCatalog: Catalog<"app"> = {
  namespace: "app",
  messages: { en, it },
};

declare module "@factory/i18n" {
  interface MessageRegistry {
    app: typeof en;
  }
}
