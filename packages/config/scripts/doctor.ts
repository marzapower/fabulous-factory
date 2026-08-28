#!/usr/bin/env node
/**
 * `pnpm factory:doctor` — human-readable capability report.
 *
 * Consumes `ENV_REGISTRY` (via `../src/env-docs.ts`'s `serviceHints`) + `deriveCapabilities`
 * directly, NEVER `getEnv()`: `getEnv()` throws on invalid env, which is exactly the state
 * doctor exists to report on without crashing. It does call the pure `parseEnv` — inside a
 * try/catch, purely to collect and print the same `EnvValidationError` issues `getEnv()`
 * would throw, never to bail out. This script never installs `server-only` and never
 * imports `src/index.ts` (`../src/env-docs.ts` is a plain module with neither).
 *
 * Loads `.env` via `readMergedEnv()` (see `../src/env-file.ts`) — a tiny hand-rolled
 * parser (no dotenv dependency) merged under real `process.env`, so shell-exported vars
 * always win over the file. Always exits 0 — this is a report, not a gate.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { deriveCapabilities, type Capabilities, type ServiceName } from "../src/capabilities";
import { serviceHints } from "../src/env-docs";
import { readMergedEnv } from "../src/env-file";
import { EnvValidationError, parseEnv } from "../src/env";
import {
  resolveDirectRoutingKey,
  resolveModel,
  TIER_ENV_KEY,
  type ModelsConfig,
  type Quality,
} from "../src/llm-routing";
import { PLANS, type Plan } from "../src/plans";
import { type AppMode, type EnvVarName, type EnvVarSpec, type RawEnv } from "../src/registry";
import { loadStage } from "./factory-stage";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

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

/**
 * Builds the "enable with: ..." hint string from a service's `enables: true` registry
 * specs, reading each spec's `combinator` instead of the old position-based/service-name
 * branching (which reverse-engineered the shape from `ENV_REGISTRY`'s array order and a
 * hardcoded `service === "llm" | "jobs"` check). Three shapes, matching the three
 * `combinator` values (registry.ts's `EnvVarSpec.combinator` doc comment):
 *
 * - Any `"anyOf"` vars present (llm) → "any of: A, B, C, D" — every var in the group is
 *   an independent alternative, so there's no AND-group to separate out.
 * - Otherwise, the `"allOf"` vars (if any) join with " + " into the AND-group phrase; a
 *   single `"allOf"` var alone renders as just its own name (billing needs both Stripe
 *   keys; email/analytics/errors need only their one var).
 * - Any `"oneOf"` vars append as ", or A, or B" — standalone alternatives to the
 *   AND-group (jobs: the two cloud keys, or INNGEST_DEV alone).
 */
export function enableWithHint(hints: readonly EnvVarSpec[]): string {
  const anyOfVars = hints.filter((spec) => spec.combinator === "anyOf");
  if (anyOfVars.length > 0) {
    return `any of: ${anyOfVars.map((spec) => spec.name).join(", ")}`;
  }

  const allOfVars = hints.filter((spec) => spec.combinator === "allOf");
  const oneOfVars = hints.filter((spec) => spec.combinator === "oneOf");
  const andPart = allOfVars.map((spec) => spec.name).join(" + ");

  if (oneOfVars.length > 0) {
    return `${andPart}, or ${oneOfVars.map((spec) => spec.name).join(", or ")}`;
  }
  return andPart;
}

const AUTH_SOCIAL_PROVIDERS: ReadonlyArray<{
  name: string;
  idVar: EnvVarName;
  secretVar: EnvVarName;
}> = [
  { name: "google", idVar: "GOOGLE_CLIENT_ID", secretVar: "GOOGLE_CLIENT_SECRET" },
  { name: "github", idVar: "GITHUB_CLIENT_ID", secretVar: "GITHUB_CLIENT_SECRET" },
];

// Mirrors the Stripe placeholder check below (`printBillingSection`'s `/REPLACE/.test(ref)`,
// I.10.7): a literal leftover placeholder is a distinct failure mode from "unset" — the var
// passes required-string validation (so `getEnv()` never catches it) yet still isn't a real
// secret. Case-insensitive: catches both the pre-M8 example value's "replace-with-..." and
// an all-caps "REPLACE_ME"-style edit.
const PLACEHOLDER_SECRET_PATTERN =
  /replace|placeholder|changeme|dummy|not-for-production|not-real/i;

/**
 * Auth is always-on (email/password), unlike the optional services above — so it gets its
 * own section rather than a `ServiceName` entry. OAuth providers light up per-provider by
 * key presence. `BETTER_AUTH_SECRET` is now REQUIRED (M8, I.3.a) — same tier as
 * `DATABASE_URL` — so a genuinely missing value is already reported by
 * `printValidationIssues` above; this section instead flags a value that IS set but still
 * looks like an unedited placeholder (I.10.7). Also flags a production deployment with no
 * `TRUSTED_PROXIES` — advisory only, since Better Auth's own untrusted-proxy default still
 * works, just with all clients behind the proxy sharing one rate-limit bucket.
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

  if (env.BETTER_AUTH_SECRET && PLACEHOLDER_SECRET_PATTERN.test(env.BETTER_AUTH_SECRET)) {
    console.log(
      "    ⚠ BETTER_AUTH_SECRET looks like a placeholder value — replace it with a real secret (openssl rand -hex 32)",
    );
  } else if (env.BETTER_AUTH_SECRET) {
    console.log(`    ✓ BETTER_AUTH_SECRET=${maskSecret(env.BETTER_AUTH_SECRET)}`);
  } else {
    console.log(
      "    ⚠ BETTER_AUTH_SECRET is not set — required (see ENVIRONMENT ISSUES above); generate one with `openssl rand -hex 32`",
    );
  }

  const trustedProxiesHint = trustedProxiesWarning(env, mode);
  if (trustedProxiesHint) {
    console.log(`    ${trustedProxiesHint}`);
  }

  console.log("");
}

/**
 * Pure — exported for tests. Advisory-only (never a hard failure, M1: doctor is a report,
 * not a gate): `null` outside production mode or once `TRUSTED_PROXIES` is set, otherwise
 * the warning line (same voice as `printBillingSection`'s `APP_URL` warning — one plain
 * sentence, states what breaks, no jargon).
 */
export function trustedProxiesWarning(env: RawEnv, mode: AppMode): string | null {
  if (mode !== "production" || env.TRUSTED_PROXIES) return null;
  return "⚠ TRUSTED_PROXIES is not set — behind a reverse proxy, every client's requests share one rate-limit bucket instead of being tracked separately";
}

const QUALITIES: readonly Quality[] = ["cheap", "balanced", "high"];

type PricingJson = Record<string, { inputUsdPerMTok?: number; outputUsdPerMTok?: number }>;

/**
 * Reads a JSON file from `packages/llm`, resolved relative to this script's own file
 * location — via `fs`, NEVER `import` (F.2.10: `packages/config` is the DAG root and
 * must not gain an import edge to `packages/llm`). Missing or unparseable files degrade
 * to `undefined`; callers turn that into a single warning line, never a crash.
 */
function readLlmJson(relativePath: string): unknown {
  try {
    const raw = readFileSync(new URL(relativePath, import.meta.url), "utf8");
    return JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Prints the active profile's resolved tier→model routing table (env overrides applied
 * and marked, via the shared `resolveModel`/`resolveDirectRoutingKey`/`TIER_ENV_KEY` —
 * plan G.3.2: this used to be a hand-rolled fork of the same override logic), plus
 * pricing-rot warnings for any routed non-local model missing from `pricing.json`, and an
 * openrouter-specific note about provider-reported cost.
 */
function printLlmRoutingSection(profile: "local" | "openrouter" | "direct", env: RawEnv): void {
  const modelsRaw = readLlmJson("../../llm/models.json");
  if (!isRecord(modelsRaw)) {
    console.log(
      "    ⚠ packages/llm/models.json is missing or unparseable — routing table unavailable",
    );
    return;
  }

  const routingKey = profile === "direct" ? resolveDirectRoutingKey(env) : profile;
  const table = modelsRaw[routingKey];
  if (!isRecord(table)) {
    console.log(
      `    ⚠ packages/llm/models.json has no '${routingKey}' entry — routing table unavailable`,
    );
    return;
  }
  // Shape-validated only as far as the existing isRecord guards ever went (whole-file
  // record, active routing-key sub-table a record) — trusted as a ModelsConfig from here
  // on, same level of trust the pre-refactor code placed in it.
  const models = modelsRaw as unknown as ModelsConfig;

  const pricingRaw = readLlmJson("../../llm/pricing.json");
  const pricing = isRecord(pricingRaw) ? (pricingRaw as PricingJson) : undefined;
  if (!pricing) {
    console.log(
      "    ⚠ packages/llm/pricing.json is missing or unparseable — cost accounting warnings unavailable",
    );
  }

  console.log(`    routing (${routingKey}):`);
  for (const quality of QUALITIES) {
    const { model } = resolveModel(profile, quality, env, models);
    if (!model) continue;
    const overrideVar = TIER_ENV_KEY[quality];
    const override = env[overrideVar];
    console.log(`      ${quality}: ${model}${override ? " (env override)" : ""}`);

    if (override) {
      // Heuristic only (review fix): openrouter ids look like 'anthropic/claude-...'
      // (contain a slash), local/direct ids don't — a stale override left over from a
      // profile switch is a common way to end up here. Calm, single-line, never fails.
      const looksOpenrouter = model.includes("/");
      if (routingKey === "openrouter" && !looksOpenrouter) {
        console.log(`    ⚠ ${overrideVar}='${model}' does not look like an openrouter model id`);
      } else if (routingKey !== "openrouter" && looksOpenrouter) {
        console.log(
          `    ⚠ ${overrideVar}='${model}' looks like an openrouter model id, but the active routing key is '${routingKey}'`,
        );
      }
    }

    if (routingKey !== "local" && pricing && !pricing[model]) {
      console.log(`    ⚠ cost accounting will record unknown cost for ${model}`);
    }
  }

  if (routingKey === "openrouter") {
    console.log("    note: actual cost is provider-reported (OpenRouter usage.cost)");
  }
}

/**
 * Doctor's billing extensions (H.2.2, H.10.14/18(f)) — never crashes, reads `PLANS` via
 * a direct import (config-internal, allowed per the task split).
 */
function printBillingSection(env: RawEnv): void {
  for (const plan of Object.values(PLANS) as Plan[]) {
    if (plan.priceUsdMonthly === null) continue; // free plans are never purchased
    const ref = plan.providerRefs.stripe;
    if (!ref || /REPLACE/.test(ref)) {
      console.log(
        `    ⚠ plan '${plan.id}' has a missing or placeholder Stripe price ref (providerRefs.stripe) — replace before going live`,
      );
    }
  }

  if (!env.APP_URL) {
    console.log("    ⚠ APP_URL is not set — checkout/portal redirect URLs will point at localhost");
  }

  console.log(
    "    note: pin the Stripe webhook endpoint's API version to the SDK's (payloads render at the ENDPOINT version)",
  );
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
    for (const spec of serviceHints(service)) {
      const value = env[spec.name as EnvVarName];
      if (!value) continue;
      const shown = spec.secret ? maskSecret(value) : value;
      console.log(`    ${spec.name}=${shown}`);
    }
  } else {
    const hints = serviceHints(service);
    console.log(`    enable with: ${enableWithHint(hints)}`);
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
    if (capabilities.llm !== "disabled") {
      printLlmRoutingSection(capabilities.llm, env);
    }
  }

  if (service === "email" && adapter === "console") {
    console.log(
      "    note: console transport is development-only; production requires RESEND_API_KEY",
    );
  }

  if (service === "jobs") {
    if (adapter === "inngest") {
      // Mode-independent per the FINAL rule (plan G.2.3/G.10.12): whichever signal lit
      // the capability determines the mode note, regardless of dev/prod/test.
      console.log(
        env.INNGEST_EVENT_KEY && env.INNGEST_SIGNING_KEY
          ? "    note: Inngest cloud mode"
          : "    note: local dev-server mode (inngest-cli dev)",
      );
    } else {
      console.log(
        "    local dev hint: set INNGEST_DEV=1 and run `pnpm dlx inngest-cli@1.41.1 dev` to enable jobs without cloud keys",
      );
    }
    if (env.INNGEST_DEV === "1" && mode === "production") {
      // Review fix: INNGEST_DEV must never enable jobs (or Inngest's signature-skipping
      // dev mode) in production — surfaced here as a warning rather than a silent
      // no-op, since a dev .env copied to prod is exactly how this var ends up set.
      console.log("    ⚠ INNGEST_DEV=1 is set but ignored in production");
    }
  }

  if (service === "billing" && adapter === "stripe") {
    printBillingSection(env);
  }

  console.log("");
}

/**
 * Doctor's factory section: stage display only. Deliberately terser than `factory:status`'s
 * full per-item `LAUNCH.md` report (opt-24) — `loadStage` never throws, so no try/catch is
 * needed here.
 */
function printFactorySection(): void {
  console.log("factory:");
  console.log(`    stage: ${loadStage(REPO_ROOT)}`);
  console.log("");
}

/** `<dir>/<locale>.json` basenames present in `dir`, or `[]` if `dir` doesn't exist. */
function listLocalesIn(dir: string): string[] {
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map((entry) => entry.name.replace(/\.json$/, ""));
  } catch {
    return [];
  }
}

/** "en" first (the conventional base locale, i18n plan §2.1), then alphabetical. */
function sortLocales(locales: Iterable<string>): string[] {
  return [...locales].sort((a, b) => {
    if (a === "en") return -1;
    if (b === "en") return 1;
    return a.localeCompare(b);
  });
}

/**
 * i18n section (i18n plan §2.6) — filesystem only, no `@factory/*` import (packages/i18n
 * itself is out of packages/config's DAG reach, and doctor never needs `defineI18n` to
 * report what's on disk). Scans `packages/ui/messages/*.json` (the shared `ui` catalog)
 * and every `apps/<name>/messages/*.json` (each app's own `app` catalog — `apps/web` in a
 * scaffolded product, `apps/untangle`/`apps/nothing`/`apps/brainstorm` here) for
 * `<locale>.json` files. Prints the union of locale codes found across every catalog,
 * plus which catalogs ("ui", "app") actually contributed one. A workspace with no
 * `messages/` directories yet (pre-i18n-migration apps, or an app that ships one locale
 * with no on-disk catalog at all) degrades to a quiet one-liner, never a crash.
 */
export function printI18nSection(repoRoot: string): void {
  const locales = new Set<string>();
  const catalogs: string[] = [];

  const uiLocales = listLocalesIn(path.join(repoRoot, "packages/ui/messages"));
  if (uiLocales.length > 0) {
    catalogs.push("ui");
    for (const locale of uiLocales) locales.add(locale);
  }

  let appNames: string[];
  try {
    appNames = readdirSync(path.join(repoRoot, "apps"), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
  } catch {
    appNames = [];
  }

  let appCatalogFound = false;
  for (const appName of appNames) {
    const appLocales = listLocalesIn(path.join(repoRoot, "apps", appName, "messages"));
    if (appLocales.length > 0) {
      appCatalogFound = true;
      for (const locale of appLocales) locales.add(locale);
    }
  }
  if (appCatalogFound) catalogs.push("app");

  console.log("i18n:");
  if (locales.size === 0) {
    console.log("    no messages/ catalogs found on disk");
  } else {
    console.log(`    ${sortLocales(locales).join(", ")} (catalogs: ${catalogs.join(", ")})`);
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

  printI18nSection(REPO_ROOT);
  printFactorySection();
}

// Guarded (same idiom as gen-env-example.ts): importing this module from a test — to
// reach the exported pure helpers (`enableWithHint`, `trustedProxiesWarning`) — must
// never also run `main()`'s real-env side effects (`readMergedEnv()`, console output).
const __filename = fileURLToPath(import.meta.url);
const invokedDirectly =
  process.argv[1] !== undefined && path.resolve(process.argv[1]) === path.resolve(__filename);

if (invokedDirectly) {
  main();
  // Always exits 0 — doctor is a report, not a gate (M1). Preflight (M9) is the gate.
  process.exitCode = 0;
}
