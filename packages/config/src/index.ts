import "server-only";

import { deriveCapabilities, type Capabilities, type ServiceName } from "./capabilities";
import { getEnv as readEnv, EnvValidationError, type Env } from "./env";
import { resolveDirectRoutingKey, resolveModel, TIER_ENV_KEY } from "./llm-routing";
import { buildClientConfig, type ClientConfig } from "./public-config";
import { ENV_REGISTRY, type AppMode } from "./registry";

export { ENV_REGISTRY, EnvValidationError };
export type { AppMode, EnvVarName, EnvVarSpec, RawEnv, ServiceGroup } from "./registry";
export type { Capabilities, ServiceName } from "./capabilities";
export type { ClientConfig } from "./public-config";
export type { Env, EnvIssue } from "./env";
export { resolveDirectRoutingKey, resolveModel, TIER_ENV_KEY };
export type { ModelsConfig, Quality, RoutingEnv, RoutingKey, TierTable } from "./llm-routing";

function resolveMode(): AppMode {
  const nodeEnv = process.env.NODE_ENV;
  return nodeEnv === "production" || nodeEnv === "test" ? nodeEnv : "development";
}

/** Zod-validated, memoized. Throws `EnvValidationError` listing every bad var. */
export function getEnv(): Env {
  return readEnv();
}

let cachedCapabilities: Capabilities | undefined;

/** Memoized derivation of the capability map over `getEnv()`. */
export function getCapabilities(): Capabilities {
  if (!cachedCapabilities) {
    cachedCapabilities = deriveCapabilities(getEnv(), resolveMode());
  }
  return cachedCapabilities;
}

export function isEnabled(service: ServiceName): boolean {
  return getCapabilities()[service] !== "disabled";
}

/** Serializable, secret-free config for `ClientConfigProvider`. */
export function getClientConfig(): ClientConfig {
  return buildClientConfig(getEnv(), getCapabilities());
}
