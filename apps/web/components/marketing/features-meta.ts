// Built with Fabulous Factory — https://github.com/marzapower/fabulous-factory
// This credit line is free to keep and gives the project a hand. Thank you!

// Type-only import: `ServiceName`/`ServiceGroup` are erased at compile time
// (verbatimModuleSyntax), so this module stays safe to import from client components —
// no runtime dependency on `@factory/config` (a server-only package) ever ships.
import type { ServiceGroup, ServiceName } from "@factory/config";
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
  kernel: {
    key: "kernel",
    title: "A handler shape you can't get wrong",
    blurb:
      "Every route and action declares its auth mode, its input schema, its rate limit — a raw handler fails lint by construction.",
    href: "/features/kernel",
    icon: SquareCode,
    services: [],
    groups: ["core"],
  },
  config: {
    key: "config",
    title: "One registry, not a scattered process.env",
    blurb:
      "Every env var is declared once — required, secret, what it enables — and the doctor, the docs, and the code can never disagree.",
    href: "/features/config",
    icon: SlidersHorizontal,
    services: [],
    groups: ["core"],
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
      "Cron, fan-out and per-step retries when they're on — and every on-demand run works exactly the same when they're off.",
    href: "/features/jobs",
    icon: Clock,
    services: ["jobs"],
    groups: ["jobs"],
  },
  security: {
    key: "security",
    title: "SSRF guarded, not just documented",
    blurb:
      "A fetch of a user-supplied URL is scheme-checked, range-blocked, and re-validated after connect — see the refusal happen, not just read about it.",
    href: "/features/security",
    icon: ShieldCheck,
    services: [],
    groups: ["core"],
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

/** Stable order for the grid — the frozen nine-key order (K.16 N4). */
export const FEATURE_LIST: FeatureMeta[] = [
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
