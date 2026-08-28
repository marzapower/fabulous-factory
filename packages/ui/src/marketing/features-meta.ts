// Built with Fabulous Factory — https://github.com/marzapower/fabulous-factory
// This credit line is free to keep and gives the project a hand. Thank you!

// Type-only import: `ServiceName`/`ServiceGroup` are erased at compile time
// (verbatimModuleSyntax), so this module stays safe to import from client components —
// no runtime dependency on `@factory/config` (a server-only package) ever ships.
import type { ServiceGroup, ServiceName } from "@factory/config";
// Type-only: used below purely as `typeof useTranslations<"ui.features">` (an
// instantiation expression) to type `featureMeta`'s translator parameter as the exact
// type `useTranslations("ui.features")` produces — a plain `(key: string) => string`
// parameter type would be unsound here (next-intl's `Translator` narrows `key` to the
// literal union of real message paths; TS's contravariant function-parameter check
// correctly rejects widening that back to `string`).
import type { useTranslations } from "@factory/i18n";
// lucide-react is a client-safe icon library — importing its types/components here
// doesn't change this module's importability from client components.
import {
  Activity,
  Bot,
  Clock,
  CreditCard,
  KeyRound,
  Mail,
  ShieldCheck,
  SlidersHorizontal,
  SquareCode,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

// Frozen set, nine entries, in grid order (m11-untangle-workspace.md K.16 N4 — BINDING,
// T12 builds `/features/*` pages against this identical list). `auth`, `kernel`,
// `config`, `security` carry `services: []` — they're baseline structure, not a runtime
// capability toggle, exactly like `auth` today.
export type FeatureKey =
  | "auth"
  | "kernel"
  | "config"
  | "llm"
  | "jobs"
  | "security"
  | "email"
  | "billing"
  | "observability";

/** Title/blurb come from the `ui.features.<key>.{title,blurb}` catalog (see
 * `featureMeta()` below) — this is the STATIC part: everything that doesn't depend on a
 * locale. */
export interface FeatureStatic {
  key: FeatureKey;
  /**
   * `/features/${key}`. Omit after deleting the /features pages (make-it-yours) —
   * FeatureCard renders no link then.
   */
  href?: string;
  /** Icon rendered on the feature card and feature page. */
  icon: LucideIcon;
  /** Capability keys for the status light(s); empty for auth (always-on baseline). */
  services: ServiceName[];
  /** Registry groups whose env vars enable this feature. */
  groups: ServiceGroup[];
}

export interface FeatureMeta extends FeatureStatic {
  /** Human title, e.g. "Payments that unlock things". */
  title: string;
  /** One-sentence card copy. */
  blurb: string;
}

export const FEATURES: Record<FeatureKey, FeatureStatic> = {
  auth: {
    key: "auth",
    href: "/features/auth",
    icon: KeyRound,
    services: [],
    groups: ["auth"],
  },
  kernel: {
    key: "kernel",
    href: "/features/kernel",
    icon: SquareCode,
    services: [],
    groups: ["core"],
  },
  config: {
    key: "config",
    href: "/features/config",
    icon: SlidersHorizontal,
    services: [],
    groups: ["core"],
  },
  billing: {
    key: "billing",
    href: "/features/billing",
    icon: CreditCard,
    services: ["billing"],
    groups: ["billing"],
  },
  llm: {
    key: "llm",
    href: "/features/llm",
    icon: Bot,
    services: ["llm"],
    groups: ["llm"],
  },
  jobs: {
    key: "jobs",
    href: "/features/jobs",
    icon: Clock,
    services: ["jobs"],
    groups: ["jobs"],
  },
  security: {
    key: "security",
    href: "/features/security",
    icon: ShieldCheck,
    services: [],
    groups: ["core"],
  },
  email: {
    key: "email",
    href: "/features/email",
    icon: Mail,
    services: ["email"],
    groups: ["email"],
  },
  observability: {
    key: "observability",
    href: "/features/observability",
    icon: Activity,
    services: ["analytics", "errors"],
    groups: ["analytics", "observability"],
  },
};

/** Stable order for the grid — the frozen nine-key order (K.16 N4). */
export const FEATURE_LIST: FeatureStatic[] = [
  FEATURES.auth,
  FEATURES.kernel,
  FEATURES.config,
  FEATURES.llm,
  FEATURES.jobs,
  FEATURES.security,
  FEATURES.email,
  FEATURES.billing,
  FEATURES.observability,
];

/**
 * Combines a feature's static shape with its translated title/blurb, read from
 * `ui.features.<key>.{title,blurb}`. `t` is the translator scoped to the `ui.features`
 * namespace (`useTranslations("ui.features")` or `getTranslations("ui.features")`).
 */
export function featureMeta(
  t: ReturnType<typeof useTranslations<"ui.features">>,
  key: FeatureKey,
): FeatureMeta {
  return {
    ...FEATURES[key],
    title: t(`${key}.title`),
    blurb: t(`${key}.blurb`),
  };
}
