import en from "../../messages/en.json";
import it from "../../messages/it.json";

import type { Catalog } from "@factory/i18n";

// Namespace "ui" — merged by the app's defineI18n() call alongside its own "app"
// catalog. The shape below is what makes `useTranslations("ui.<component>.<key>")`
// typecheck inside this package via declaration merging on `MessageRegistry`.
export const uiCatalog: Catalog<"ui"> = {
  namespace: "ui",
  messages: { en, it },
};

declare module "@factory/i18n" {
  interface MessageRegistry {
    ui: typeof en;
  }
}
