import DEFAULT_MODELS_JSON from "../models.json";

/**
 * Quality tier a caller asks `generate()` for (spec §5.4). Canonical home of this type —
 * `generate.ts`'s `GenerateOptions`/`GenerateResult` re-export it from here rather than
 * redeclaring it.
 */
export type Quality = "cheap" | "balanced" | "high";

/**
 * Concrete routing table key. `direct` (the capability-level profile) is NOT a
 * `RoutingKey` — it splits into `direct-anthropic`/`direct-openai` by credential
 * precedence (`resolveModel` below), mirroring `hasCredentialsFor` in
 * `packages/config/src/capabilities.ts` (Anthropic first).
 */
export type RoutingKey = "local" | "openrouter" | "direct-anthropic" | "direct-openai";

export type TierTable = Record<Quality, string>;

export type ModelsConfig = Record<RoutingKey, TierTable>;

/**
 * Structural view of the env vars `resolveModel` reads. Deliberately NOT `@factory/config`'s
 * `Env`/`RawEnv` — this file stays a pure, dependency-free leaf (plan F.2.1/F.8) so it
 * compiles standalone regardless of what the config registry looks like.
 */
export interface RoutingEnv {
  LLM_MODEL_CHEAP?: string;
  LLM_MODEL_BALANCED?: string;
  LLM_MODEL_HIGH?: string;
  ANTHROPIC_API_KEY?: string;
  OPENAI_API_KEY?: string;
}

export const DEFAULT_MODELS: ModelsConfig = DEFAULT_MODELS_JSON;

const TIER_ENV_KEY: Record<Quality, keyof RoutingEnv> = {
  cheap: "LLM_MODEL_CHEAP",
  balanced: "LLM_MODEL_BALANCED",
  high: "LLM_MODEL_HIGH",
};

/**
 * Resolves the concrete `RoutingKey` for the `direct` profile: `direct-anthropic` when
 * `ANTHROPIC_API_KEY` is present, else `direct-openai`. Mirrors `hasCredentialsFor`'s
 * `case "direct"` precedence in `packages/config/src/capabilities.ts` exactly (Anthropic
 * checked first).
 */
function resolveDirectRoutingKey(env: RoutingEnv): "direct-anthropic" | "direct-openai" {
  return env.ANTHROPIC_API_KEY ? "direct-anthropic" : "direct-openai";
}

/**
 * Resolves the model id + routing key for a capability profile and quality tier (plan
 * F.4/F.2.9). Pure: reads only `models` (default `DEFAULT_MODELS`, i.e. `models.json`)
 * and the structural `env`. An `LLM_MODEL_<TIER>` env var matching the REQUESTED
 * `quality` — not the routing key's own tier name, they're the same axis — replaces the
 * routed id whenever it's set to a non-empty string.
 */
export function resolveModel(
  profile: "local" | "openrouter" | "direct",
  quality: Quality,
  env: RoutingEnv,
  models: ModelsConfig = DEFAULT_MODELS,
): { model: string; routingKey: RoutingKey } {
  const routingKey: RoutingKey = profile === "direct" ? resolveDirectRoutingKey(env) : profile;

  const routedModel = models[routingKey][quality];
  const override = env[TIER_ENV_KEY[quality]];
  const model = override ? override : routedModel;

  return { model, routingKey };
}
