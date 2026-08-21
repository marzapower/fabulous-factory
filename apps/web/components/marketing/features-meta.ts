// Built with Fabulous Factory — https://github.com/marzapower/fabulous-factory
// This credit line is free to keep and gives the project a hand. Thank you!

// Type-only import: `ServiceName`/`ServiceGroup` are erased at compile time
// (verbatimModuleSyntax), so this module stays safe to import from client components —
// no runtime dependency on `@factory/config` (a server-only package) ever ships.
import type { ServiceGroup, ServiceName } from "@factory/config";
// lucide-react is a client-safe icon library — importing its types/components here
// doesn't change this module's importability from client components.
import { Activity, Bot, Clock, CreditCard, KeyRound, Mail } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type FeatureKey = "auth" | "billing" | "llm" | "jobs" | "email" | "observability";

export interface FeatureMeta {
  key: FeatureKey;
  /** Human title, e.g. "Payments that unlock things". */
  title: string;
  /** One-sentence card copy. */
  blurb: string;
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

export const FEATURES: Record<FeatureKey, FeatureMeta> = {
  auth: {
    key: "auth",
    title: "Sign-in that's already done",
    blurb:
      "Email and password work on day one; OAuth and magic links turn on the moment you add keys.",
    href: "/features/auth",
    icon: KeyRound,
    services: [],
    groups: ["auth"],
  },
  billing: {
    key: "billing",
    title: "Payments that unlock things",
    blurb:
      "Stripe checkout and webhooks, wired end to end — free mode when it's off, so nothing blocks a demo.",
    href: "/features/billing",
    icon: CreditCard,
    services: ["billing"],
    groups: ["billing"],
  },
  llm: {
    key: "llm",
    title: "An AI gateway, not a vendor lock-in",
    blurb:
      "Local, OpenRouter, or a direct key — swap providers without touching a single call site.",
    href: "/features/llm",
    icon: Bot,
    services: ["llm"],
    groups: ["llm"],
  },
  jobs: {
    key: "jobs",
    title: "Cron your agent can trust",
    blurb:
      'Background jobs and step functions, with a manual "check now" fallback when they\'re off.',
    href: "/features/jobs",
    icon: Clock,
    services: ["jobs"],
    groups: ["jobs"],
  },
  email: {
    key: "email",
    title: "Email that never blocks a signup",
    blurb:
      "Resend in production, the console in dev — nothing waits on a provider that isn't there.",
    href: "/features/email",
    icon: Mail,
    services: ["email"],
    groups: ["email"],
  },
  observability: {
    key: "observability",
    title: "See it break before your users do",
    blurb:
      "Product analytics and error tracking, both a silent no-op when you haven't set them up yet.",
    href: "/features/observability",
    icon: Activity,
    services: ["analytics", "errors"],
    groups: ["analytics", "observability"],
  },
};

/** Stable order for the grid. */
export const FEATURE_LIST: FeatureMeta[] = [
  FEATURES.auth,
  FEATURES.billing,
  FEATURES.llm,
  FEATURES.jobs,
  FEATURES.email,
  FEATURES.observability,
];
