#!/usr/bin/env node
/**
 * `pnpm factory:doctor` — human-readable capability report.
 *
 * Consumes `ENV_REGISTRY` + `deriveCapabilities` directly, NEVER `getEnv()`: `getEnv()`
 * throws on invalid env, which is exactly the state doctor exists to report on without
 * crashing. It does call the pure `parseEnv` — inside a try/catch, purely to collect and
 * print the same `EnvValidationError` issues `getEnv()` would throw, never to bail out.
 * This script never installs `server-only` and never imports `src/index.ts`.
 *
 * Loads `.env` via `readMergedEnv()` (see `../src/env-file.ts`) — a tiny hand-rolled
 * parser (no dotenv dependency) merged under real `process.env`, so shell-exported vars
 * always win over the file. Always exits 0 — this is a report, not a gate.
 */
import { deriveCapabilities, type Capabilities, type ServiceName } from "../src/capabilities";
import { readMergedEnv } from "../src/env-file";
import { EnvValidationError, parseEnv } from "../src/env";
import { ENV_REGISTRY, type AppMode, type EnvVarName, type RawEnv } from "../src/registry";

function resolveMode(): AppMode {
  const nodeEnv = process.env.NODE_ENV;
  return nodeEnv === "production" || nodeEnv === "test" ? nodeEnv : "development";
}

function maskSecret(value: string): string {
  if (value.length <= 4) return "****";
  return `${value.slice(0, 4)}${"*".repeat(Math.max(4, value.length - 4))}`;
}

const SERVICE_TITLES: Record<ServiceName, string> = {
  billing: "billing",
  llm: "llm",
  email: "email",
  jobs: "jobs",
  analytics: "analytics",
  errors: "errors",
};

// Which registry vars are relevant enablement hints per service.
const SERVICE_VARS: Record<ServiceName, EnvVarName[]> = {
  billing: ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"],
  llm: ["OPENROUTER_API_KEY", "ANTHROPIC_API_KEY", "OPENAI_API_KEY", "LLM_LOCAL_BASE_URL"],
  email: ["RESEND_API_KEY"],
  jobs: ["INNGEST_EVENT_KEY", "INNGEST_SIGNING_KEY"],
  analytics: ["POSTHOG_KEY"],
  errors: ["SENTRY_DSN"],
};

const AUTH_SOCIAL_PROVIDERS: ReadonlyArray<{
  name: string;
  idVar: EnvVarName;
  secretVar: EnvVarName;
}> = [
  { name: "google", idVar: "GOOGLE_CLIENT_ID", secretVar: "GOOGLE_CLIENT_SECRET" },
  { name: "github", idVar: "GITHUB_CLIENT_ID", secretVar: "GITHUB_CLIENT_SECRET" },
];

/**
 * Auth is always-on (email/password), unlike the optional services above — so it gets its
 * own section rather than a `ServiceName` entry. OAuth providers light up per-provider by
 * key presence; `BETTER_AUTH_SECRET` gets a warning in production (auth endpoints fail
 * without it) and an advisory in development (Better Auth's built-in dev fallback covers
 * it, but it must be set before deploying).
 */
function printAuthSection(env: RawEnv, mode: AppMode): void {
  console.log("✓ auth: email/password (always on)");

  for (const provider of AUTH_SOCIAL_PROVIDERS) {
    const enabled = Boolean(env[provider.idVar] && env[provider.secretVar]);
    console.log(`    ${enabled ? "✓" : "✗"} ${provider.name}: ${enabled ? "enabled" : "disabled"}`);
    if (!enabled) {
      console.log(`      enable with: ${provider.idVar} + ${provider.secretVar}`);
    }
  }

  if (env.BETTER_AUTH_SECRET) {
    console.log(`    ✓ BETTER_AUTH_SECRET=${maskSecret(env.BETTER_AUTH_SECRET)}`);
  } else if (mode === "production") {
    console.log("    ⚠ BETTER_AUTH_SECRET is not set — auth endpoints will fail until set");
  } else {
    console.log("    ⚠ BETTER_AUTH_SECRET is not set — set it before deploying to production");
  }

  console.log("");
}

function printHeader(mode: AppMode): void {
  console.log("Fabulous Factory — pnpm factory:doctor");
  console.log(`mode: ${mode}`);
  console.log("");
}

function printValidationIssues(env: RawEnv): void {
  // Runs the same aggregated validation `getEnv()` would run at request time — via the
  // pure `parseEnv`, never `getEnv()` itself, so an invalid env never crashes doctor.
  // Covers both missing-required and malformed values (e.g. a bad LLM_PROFILE) in one
  // red block, since parseEnv already aggregates both into a single EnvValidationError.
  try {
    parseEnv(env);
  } catch (error) {
    if (!(error instanceof EnvValidationError)) throw error;
    console.log("✗ ENVIRONMENT ISSUES");
    for (const issue of error.issues) {
      console.log(`  - ${issue.name}: ${issue.message}`);
    }
    console.log("");
  }
}

function printServiceLine(
  service: ServiceName,
  capabilities: Capabilities,
  env: RawEnv,
  mode: AppMode,
): void {
  const adapter = capabilities[service];
  const enabled = adapter !== "disabled";
  const glyph = enabled ? "✓" : "✗";

  console.log(`${glyph} ${SERVICE_TITLES[service]}: ${adapter}`);

  if (enabled) {
    for (const varName of SERVICE_VARS[service]) {
      const value = env[varName];
      if (!value) continue;
      const spec = ENV_REGISTRY.find((s) => s.name === varName);
      const shown = spec?.secret ? maskSecret(value) : value;
      console.log(`    ${varName}=${shown}`);
    }
  } else {
    const hints = SERVICE_VARS[service]
      .map((varName) => ENV_REGISTRY.find((spec) => spec.name === varName))
      .filter((spec): spec is (typeof ENV_REGISTRY)[number] => spec !== undefined);
    const names = hints.map((spec) => spec.name);
    // llm's hint vars are alternatives (any single one enables a profile); billing/jobs
    // need every listed var set together — "+" would misleadingly imply llm needs all.
    const enableWith = service === "llm" ? `any of: ${names.join(", ")}` : names.join(" + ");
    console.log(`    enable with: ${enableWith}`);
    for (const spec of hints) {
      console.log(`      ${spec.name}: ${spec.description}`);
    }
  }

  if (service === "llm") {
    console.log(
      "    local profile hint: point LLM_LOCAL_BASE_URL at an OpenAI-compatible server — Ollama's default is http://localhost:11434/v1",
    );
    if (env.LLM_PROFILE && env.LLM_PROFILE !== "disabled" && capabilities.llm === "disabled") {
      console.log(
        `    warning: LLM_PROFILE=${env.LLM_PROFILE} is set but its credentials are missing — falling back to disabled`,
      );
    }
  }

  if (service === "email" && adapter === "console") {
    console.log(
      "    note: console transport is development-only; production requires RESEND_API_KEY",
    );
  }

  if (
    service === "jobs" &&
    adapter === "inngest" &&
    mode === "development" &&
    !(env.INNGEST_EVENT_KEY && env.INNGEST_SIGNING_KEY)
  ) {
    console.log(
      "    note: using the local `inngest dev` server (no INNGEST_EVENT_KEY/INNGEST_SIGNING_KEY set)",
    );
  }

  console.log("");
}

function main(): void {
  const env = readMergedEnv();
  const mode = resolveMode();
  const capabilities = deriveCapabilities(env, mode);

  printHeader(mode);
  printValidationIssues(env);
  printAuthSection(env, mode);

  for (const service of Object.keys(SERVICE_TITLES) as ServiceName[]) {
    printServiceLine(service, capabilities, env, mode);
  }
}

main();
// Always exits 0 — doctor is a report, not a gate (M1). Preflight (M9) is the gate.
process.exitCode = 0;
