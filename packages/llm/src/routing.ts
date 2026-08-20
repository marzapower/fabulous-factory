import {
  resolveDirectRoutingKey,
  resolveModel as resolveModelBase,
  TIER_ENV_KEY,
  type ModelsConfig,
  type Quality,
  type RoutingEnv,
  type RoutingKey,
  type TierTable,
} from "@factory/config";

import DEFAULT_MODELS_JSON from "../models.json";

/**
 * Routing types/logic moved to `packages/config/src/llm-routing.ts` (plan G.3.2 — M5
 * review follow-up: doctor previously forked this same override logic). Re-exported here
 * so every existing `./routing` import site in this package keeps working unchanged.
 */
export { resolveDirectRoutingKey, TIER_ENV_KEY };
export type { ModelsConfig, Quality, RoutingEnv, RoutingKey, TierTable };

/** `models.json` stays an llm-side asset — `packages/config` cannot import it (DAG root). */
export const DEFAULT_MODELS: ModelsConfig = DEFAULT_MODELS_JSON;

/**
 * Thin wrapper over the shared `resolveModel` that restores llm's optional `models`
 * parameter (defaulting to `DEFAULT_MODELS`, i.e. `models.json`) — the shared module's
 * own `resolveModel` requires it explicitly, since `packages/config` has no default table
 * of its own to fall back to.
 */
export function resolveModel(
  profile: "local" | "openrouter" | "direct",
  quality: Quality,
  env: RoutingEnv,
  models: ModelsConfig = DEFAULT_MODELS,
): { model: string; routingKey: RoutingKey } {
  return resolveModelBase(profile, quality, env, models);
}
