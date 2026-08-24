/**
 * The single source of truth for every environment variable the factory knows about.
 *
 * `.env.example` (via `scripts/gen-env-example.ts`), `pnpm factory:doctor` (via `scripts/doctor.ts`),
 * and the zod validation schema (`env.ts`) all derive from `ENV_REGISTRY` — so the generated
 * file, the human-readable report, and the runtime validation can never disagree.
 *
 * Vars for services owned by later milestones (billing, LLM, email, jobs, analytics,
 * observability) are registered here from day one so `.env.example` and `doctor` are
 * complete from the start; their detection logic may be refined in the owning milestone.
 */

export type ServiceGroup =
  "core" | "auth" | "billing" | "llm" | "email" | "jobs" | "analytics" | "observability";

export interface EnvVarSpec {
  /** e.g. "STRIPE_SECRET_KEY" */
  name: string;
  group: ServiceGroup;
  /** One line, shown in the `.env.example` comment and in `doctor` hints. */
  description: string;
  /** Placeholder value for `.env.example` — never a real secret. */
  example?: string;
  /** `DATABASE_URL` and `BETTER_AUTH_SECRET` are true (M8: pg + auth is the minimum). */
  required?: boolean;
  /** `doctor` masks the value when printing it. */
  secret?: boolean;
  /**
   * True iff this var's mere PRESENCE can light up a capability (plan G.3.3/G.10.10) —
   * `doctor` derives each service's enablement-hint var list from
   * `ENV_REGISTRY.filter(v => v.group === group && v.enables)` instead of a hand-maintained
   * shadow map. REQUIRED (not optional) for the same uniform-literal-shape reason as
   * `required`/`secret` below.
   */
  enables: boolean;
  /**
   * How this var combines with the other `enables: true` vars in its `group` to light up
   * the service — the single source of truth `capabilities.ts`'s `deriveX` functions and
   * `doctor.ts`'s `enableWith` hint both read instead of separately re-encoding the same
   * AND/OR shape (previously: capabilities.ts hand-coded each service's boolean logic,
   * doctor.ts reverse-engineered a hint string from array order — nothing kept the two in
   * sync). `null` for every var that doesn't participate in a multi-var enablement rule
   * (including every var with `enables: false`). REQUIRED (not optional) for the same
   * uniform-literal-shape reason as `required`/`secret`/`enables` above.
   *
   * - `"allOf"` — part of an AND-group: every `"allOf"` var in the group must be present
   *   together (e.g. STRIPE_SECRET_KEY + STRIPE_WEBHOOK_SECRET). A single `"allOf"` var
   *   alone in its group is simply "this var enables the service by itself" (RESEND_API_KEY,
   *   POSTHOG_KEY, SENTRY_DSN).
   * - `"oneOf"` — a standalone alternative to the group's `"allOf"` AND-group: present
   *   alone, it enables the service even when the AND-group isn't satisfied (INNGEST_DEV,
   *   alongside the INNGEST_EVENT_KEY + INNGEST_SIGNING_KEY pair).
   * - `"anyOf"` — one of several mutually-independent alternatives, ANY single one of which
   *   enables the service on its own (the four LLM credential vars).
   */
  combinator: "allOf" | "oneOf" | "anyOf" | null;
}

// Every entry declares `required`, `secret`, `enables`, and `combinator` explicitly
// (never omitted), even when `false`/`null`. With `as const`, an omitted optional key
// disappears from that literal's type entirely rather than becoming `key?: undefined` —
// the resulting union of differently shaped literals would then reject uniform
// `.required`/`.secret`/`.enables`/`.combinator` access (TS2339) from code that iterates
// `ENV_REGISTRY` generically (env.ts, doctor.ts, capabilities.ts, tests). Explicit values
// on every entry keep the literal shapes uniform and the registry the honest single
// source of truth for all four fields.
export const ENV_REGISTRY = [
  {
    name: "DATABASE_URL",
    group: "core",
    description:
      "Postgres connection string. Required — pg + auth is the minimum (see BETTER_AUTH_SECRET below); every other service is optional.",
    example: "postgres://postgres:changeme@localhost:5432/fabulous_factory_dev",
    required: true,
    // A Postgres connection string embeds credentials — doctor must mask it too.
    secret: true,
    enables: false,
    combinator: null,
  },
  {
    name: "APP_URL",
    group: "core",
    description:
      "Public base URL of the app, used for absolute links (e.g. billing redirects, email links). Defaults to 'http://localhost:3000' when unset.",
    example: "http://localhost:3000",
    required: false,
    secret: false,
    enables: false,
    combinator: null,
  },
  {
    name: "FACTORY_SKIP_MIGRATIONS",
    group: "core",
    description:
      "Set to '1' to skip the automatic pending-migration run chained into 'pnpm dev' (for teams that manage migrations explicitly).",
    example: "1",
    required: false,
    secret: false,
    enables: false,
    combinator: null,
  },
  {
    name: "BETTER_AUTH_SECRET",
    group: "auth",
    description:
      "Secret used to sign and encrypt session tokens, min 16 characters. Required — pg + auth is the minimum (M8). Generate with `openssl rand -hex 32`.",
    // Deliberately no placeholder here (I.10.7): a required var's example ships
    // UNCOMMENTED in .env.example (see gen-env-example.ts's `formatVar`), so unlike every
    // other secret below, a real-looking example would ship a WORKING default secret in
    // a file gitleaks allowlists. Empty forces the operator to generate their own; the
    // `openssl` idiom above is what ends up next to it as a comment.
    example: "",
    required: true,
    secret: true,
    enables: false,
    combinator: null,
  },
  {
    name: "GOOGLE_CLIENT_ID",
    group: "auth",
    description:
      "Google OAuth client ID. The 'google' sign-in provider is enabled only when this and GOOGLE_CLIENT_SECRET are both set.",
    example: "your-google-client-id.apps.googleusercontent.com",
    required: false,
    secret: false,
    enables: false,
    combinator: null,
  },
  {
    name: "GOOGLE_CLIENT_SECRET",
    group: "auth",
    description: "Google OAuth client secret.",
    example: "GOCSPX-your-google-client-secret",
    required: false,
    secret: true,
    enables: false,
    combinator: null,
  },
  {
    name: "GITHUB_CLIENT_ID",
    group: "auth",
    description:
      "GitHub OAuth client ID. The 'github' sign-in provider is enabled only when this and GITHUB_CLIENT_SECRET are both set.",
    example: "your-github-oauth-client-id",
    required: false,
    secret: false,
    enables: false,
    combinator: null,
  },
  {
    name: "GITHUB_CLIENT_SECRET",
    group: "auth",
    description: "GitHub OAuth client secret.",
    example: "your-github-oauth-client-secret",
    required: false,
    secret: true,
    enables: false,
    combinator: null,
  },
  {
    name: "TRUSTED_PROXIES",
    group: "auth",
    description:
      "Comma-separated list of trusted reverse-proxy IPs/CIDR ranges (e.g. '10.0.0.0/24,192.0.2.10'), wired into Better Auth's advanced.ipAddress.trustedProxies. Unset means every proxy hop in X-Forwarded-For is trusted (Better Auth's own default) — set this whenever the app sits behind a reverse proxy so client IPs (used for rate limiting) resolve correctly instead of collapsing every client behind the proxy into one shared bucket.",
    example: "10.0.0.0/24,192.0.2.10",
    required: false,
    secret: false,
    enables: false,
    combinator: null,
  },
  {
    name: "BILLING_PROVIDER",
    group: "billing",
    description:
      "Explicit billing provider override. Set to 'disabled' to force billing off even if Stripe keys are present.",
    example: "stripe",
    required: false,
    secret: false,
    enables: false,
    combinator: null,
  },
  {
    name: "STRIPE_SECRET_KEY",
    group: "billing",
    description:
      "Stripe secret API key. Billing is enabled only when this and STRIPE_WEBHOOK_SECRET are both set.",
    example: "sk_test_your_stripe_secret_key",
    required: false,
    secret: true,
    enables: true,
    combinator: "allOf",
  },
  {
    name: "STRIPE_WEBHOOK_SECRET",
    group: "billing",
    description: "Stripe webhook signing secret, used to verify incoming webhook events.",
    example: "whsec_your_stripe_webhook_secret",
    required: false,
    secret: true,
    enables: true,
    combinator: "allOf",
  },
  {
    name: "LLM_PROFILE",
    group: "llm",
    description:
      "Explicit LLM profile override ('local' | 'openrouter' | 'direct' | 'disabled'). When unset, the profile is auto-detected from whichever credentials are present.",
    example: "openrouter",
    required: false,
    secret: false,
    enables: false,
    combinator: null,
  },
  {
    name: "LLM_LOCAL_BASE_URL",
    group: "llm",
    description:
      "Base URL of an OpenAI-compatible local LLM server — e.g. Ollama's default 'http://localhost:11434/v1'.",
    example: "http://localhost:11434/v1",
    required: false,
    secret: false,
    enables: true,
    combinator: "anyOf",
  },
  {
    name: "OPENROUTER_API_KEY",
    group: "llm",
    description:
      "OpenRouter API key. Enables the 'openrouter' LLM profile (the recommended production default).",
    example: "sk-or-your-openrouter-api-key",
    required: false,
    secret: true,
    enables: true,
    combinator: "anyOf",
  },
  {
    name: "ANTHROPIC_API_KEY",
    group: "llm",
    description: "Anthropic API key. Enables the 'direct' LLM profile.",
    example: "sk-ant-your-anthropic-api-key",
    required: false,
    secret: true,
    enables: true,
    combinator: "anyOf",
  },
  {
    name: "OPENAI_API_KEY",
    group: "llm",
    description:
      "OpenAI API key. Enables the 'direct' LLM profile (used when ANTHROPIC_API_KEY is not set).",
    example: "sk-your-openai-api-key",
    required: false,
    secret: true,
    enables: true,
    combinator: "anyOf",
  },
  {
    name: "LLM_MODEL_CHEAP",
    group: "llm",
    description:
      "Override the routed model id for the 'cheap' quality tier of the active LLM profile. The id must be valid for THAT profile's provider — OpenRouter ids look like 'anthropic/claude-haiku-4.5', direct Anthropic ids like 'claude-haiku-4-5' (a profile switch invalidates a stale override).",
    example: "anthropic/claude-haiku-4.5",
    required: false,
    secret: false,
    enables: false,
    combinator: null,
  },
  {
    name: "LLM_MODEL_BALANCED",
    group: "llm",
    description:
      "Override the routed model id for the 'balanced' quality tier of the active LLM profile. The id must be valid for THAT profile's provider — OpenRouter ids look like 'anthropic/claude-haiku-4.5', direct Anthropic ids like 'claude-haiku-4-5' (a profile switch invalidates a stale override).",
    example: "anthropic/claude-sonnet-4.6",
    required: false,
    secret: false,
    enables: false,
    combinator: null,
  },
  {
    name: "LLM_MODEL_HIGH",
    group: "llm",
    description:
      "Override the routed model id for the 'high' quality tier of the active LLM profile. The id must be valid for THAT profile's provider — OpenRouter ids look like 'anthropic/claude-haiku-4.5', direct Anthropic ids like 'claude-haiku-4-5' (a profile switch invalidates a stale override).",
    example: "anthropic/claude-opus-5",
    required: false,
    secret: false,
    enables: false,
    combinator: null,
  },
  {
    name: "RESEND_API_KEY",
    group: "email",
    description:
      "Resend API key. Enables the 'resend' email transport; without it, email falls back to console logging in development or is disabled in production.",
    example: "re_your_resend_api_key",
    required: false,
    secret: true,
    enables: true,
    combinator: "allOf",
  },
  {
    name: "EMAIL_FROM",
    group: "email",
    description: "Default 'From' address used for outgoing emails.",
    example: "Fabulous Factory <hello@example.com>",
    required: false,
    secret: false,
    enables: false,
    combinator: null,
  },
  {
    name: "INNGEST_EVENT_KEY",
    group: "jobs",
    description: "Inngest event key, used to send events to Inngest Cloud.",
    example: "your-inngest-event-key",
    required: false,
    secret: true,
    enables: true,
    combinator: "allOf",
  },
  {
    name: "INNGEST_SIGNING_KEY",
    group: "jobs",
    description: "Inngest signing key, used to verify inbound Inngest requests.",
    example: "signkey-your-inngest-signing-key",
    required: false,
    secret: true,
    enables: true,
    combinator: "allOf",
  },
  {
    name: "INNGEST_DEV",
    group: "jobs",
    description:
      "Set to '1' to run jobs against a local Inngest dev server (`pnpm dlx inngest-cli@1.41.1 dev`). Without this or the two cloud keys, jobs are disabled. Development-only: ignored in production.",
    example: "1",
    required: false,
    secret: false,
    enables: true,
    combinator: "oneOf",
  },
  {
    name: "INNGEST_BASE_URL",
    group: "jobs",
    description:
      "Base URL of a self-hosted Inngest server (e.g. Docker Compose's 'http://inngest:8288'). The Inngest SDK reads this straight from process.env in cloud mode — it does NOT gate the 'jobs' capability (that's still the two cloud keys or INNGEST_DEV, above); registered here purely so doctor/.env.example don't stay blind to it.",
    example: "http://inngest:8288",
    required: false,
    secret: false,
    enables: false,
    combinator: null,
  },
  {
    name: "POSTHOG_KEY",
    group: "analytics",
    description:
      "PostHog project API key (publishable). Enables analytics and is forwarded to the client via ClientConfigProvider.",
    example: "phc_your_posthog_project_key",
    required: false,
    secret: false,
    enables: true,
    combinator: "allOf",
  },
  {
    name: "POSTHOG_HOST",
    group: "analytics",
    description: "PostHog ingestion host. Defaults to 'https://us.i.posthog.com' when unset.",
    example: "https://us.i.posthog.com",
    required: false,
    secret: false,
    enables: false,
    combinator: null,
  },
  {
    name: "SENTRY_DSN",
    group: "observability",
    description: "Sentry DSN. Enables error reporting via the 'sentry' errors adapter.",
    example: "https://examplePublicKey@o0.ingest.sentry.io/0",
    required: false,
    secret: false,
    enables: true,
    combinator: "allOf",
  },
] as const satisfies readonly EnvVarSpec[];

/** Literal union of every registered env var name. */
export type EnvVarName = (typeof ENV_REGISTRY)[number]["name"];

/** Raw string values keyed by registered env var name — nothing else ever passes through. */
export type RawEnv = Partial<Record<EnvVarName, string>>;

/** NODE_ENV-derived application mode. */
export type AppMode = "development" | "production" | "test";
