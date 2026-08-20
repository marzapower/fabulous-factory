/**
 * Provider resolution (plan F.4/F.2.3/F.2.4). `resolveLanguageModel` is the ONLY place in
 * `packages/llm` that decides which vendor SDK to load: it reads `getCapabilities().llm`
 * — never `process.env` directly — and, for every profile except `disabled`, guard-loads
 * exactly the active profile's provider package via a dynamic `import()` (the M4
 * `packages/email/src/send.ts` pattern). The `disabled` path throws `LlmDisabledError`
 * BEFORE any provider module is touched, so `capabilities.llm === 'disabled'` costs
 * nothing beyond the capability check itself (test-asserted via a module-registry check
 * in `test/disabled.test.ts`).
 */
import type { LanguageModel } from "ai";

import { getCapabilities, getEnv, type Env } from "@factory/config";

import { LlmDisabledError } from "./errors";
import { resolveModel, type Quality, type RoutingKey } from "./routing";

export interface ResolvedModel {
  model: LanguageModel;
  modelId: string;
  profile: "local" | "openrouter" | "direct";
  routingKey: RoutingKey;
}

type ProviderFactory = (modelId: string) => LanguageModel;

/**
 * Provider factory instances, memoized per process and keyed by the capability-level
 * `profile` (plan F.2.4) — cheap re-resolution on every call, no re-construction of the
 * underlying SDK client. Keying by profile alone (rather than by the finer-grained
 * `RoutingKey`) is sufficient: within a single process, `capabilities.llm === 'direct'`
 * always resolves to the SAME `direct-anthropic` / `direct-openai` sub-table (it's
 * determined once by which credential env vars are present, mirroring
 * `hasCredentialsFor`'s precedence in `packages/config/src/capabilities.ts`), so the
 * factory built on first call is correct for every subsequent call in the same process.
 */
const factoryCache = new Map<ResolvedModel["profile"], ProviderFactory>();

async function buildProviderFactory(
  profile: ResolvedModel["profile"],
  routingKey: RoutingKey,
  env: Env,
): Promise<ProviderFactory> {
  if (profile === "local") {
    const { createOpenAICompatible } = await import("@ai-sdk/openai-compatible");
    const provider = createOpenAICompatible({
      name: "local",
      // Non-null assertion: `capabilities.llm === 'local'` is only ever derived when
      // `LLM_LOCAL_BASE_URL` is set (`hasCredentialsFor`, packages/config), so this is
      // always present on the local branch.
      baseURL: env.LLM_LOCAL_BASE_URL!,
      includeUsage: true,
    });
    return (modelId) => provider(modelId);
  }

  if (profile === "openrouter") {
    const { createOpenRouter } = await import("@openrouter/ai-sdk-provider");
    const provider = createOpenRouter({ apiKey: env.OPENROUTER_API_KEY });
    // `usage.include` is opt-in AT THE SDK LEVEL, and lives on the per-model chat
    // settings (OpenRouterSharedSettings), not the provider factory — verified in the
    // 3.0.0 dist. Without it OpenRouter may omit `usage.cost` from responses and
    // generate.ts's 'reported' cost path silently never fires, degrading every
    // openrouter row to pricing.json estimates (review finding, M5).
    return (modelId) => provider.chat(modelId, { usage: { include: true } });
  }

  // profile === "direct"
  if (routingKey === "direct-anthropic") {
    const { createAnthropic } = await import("@ai-sdk/anthropic");
    const provider = createAnthropic({ apiKey: env.ANTHROPIC_API_KEY });
    return (modelId) => provider(modelId);
  }

  const { createOpenAI } = await import("@ai-sdk/openai");
  const provider = createOpenAI({ apiKey: env.OPENAI_API_KEY });
  return (modelId) => provider(modelId);
}

/**
 * Resolves the language model to call for a given quality tier: capability check →
 * routing → guarded provider import → provider-built model object. Throws
 * `LlmDisabledError` when `capabilities.llm === 'disabled'`, before any provider module is
 * imported and before `getEnv()` is even consulted for provider credentials.
 *
 * Invariant (plan F.10.10): the returned `model` is always a provider-built OBJECT, never
 * a bare model-id string — `ai` v7 silently routes bare strings through the bundled
 * Vercel AI Gateway, which would bypass our profile selection entirely. Enforced here with
 * a cheap runtime assertion rather than left as a structural hope, since a future edit to
 * this file could otherwise reintroduce a bare-string return without any test catching it.
 */
export async function resolveLanguageModel(quality: Quality): Promise<ResolvedModel> {
  const capabilities = getCapabilities();
  if (capabilities.llm === "disabled") {
    throw new LlmDisabledError();
  }

  const profile = capabilities.llm;
  const env = getEnv();
  const { model: modelId, routingKey } = resolveModel(profile, quality, env);

  let factory = factoryCache.get(profile);
  if (!factory) {
    factory = await buildProviderFactory(profile, routingKey, env);
    factoryCache.set(profile, factory);
  }

  const model = factory(modelId);
  if (typeof model !== "object" || model === null) {
    throw new Error(
      "[@factory/llm] internal invariant violated: resolveLanguageModel produced a bare " +
        "model id instead of a provider object — refusing to let it fall through to the " +
        "Vercel AI Gateway.",
    );
  }

  return { model, modelId, profile, routingKey };
}
