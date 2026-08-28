import en from "./en.json";

import type { Catalog } from "@factory/i18n";

// Namespace "app" — this preset's own copy: the moved shared route files (page
// metadata, error/not-found, legal, auth page shells, settings/dashboard shells).
// Product-specific copy (components/**, the homepage STEPS) stays hardcoded English
// (plan D6) and is never in this catalog. Single locale today ("en" only, plan D6) — no
// it.json stub, `en.json` is both the base and the only catalog file.
export const appCatalog: Catalog<"app"> = {
  namespace: "app",
  messages: { en },
};

declare module "@factory/i18n" {
  interface MessageRegistry {
    app: typeof en;
  }
}
