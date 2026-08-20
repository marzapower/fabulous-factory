/**
 * Node-scripts-only entry point (`@factory/config/node`) — for the migrator, seed script,
 * `doctor`, and any other CLI tooling that runs outside the Next.js server-component
 * boundary. Re-exports the same env/capability primitives as the "." entry, WITHOUT that
 * entry's `import "server-only"` poison, so plain `tsx`/Node scripts can import it
 * directly without detonating.
 *
 * App code (route handlers, server components, server actions, etc.) MUST import from
 * "@factory/config" (the "." entry) instead — never from here. A boundary lint rule
 * enforces this from M3 onward; until then, this doc comment is the contract.
 */
import { deriveCapabilities, type Capabilities, type ServiceName } from "./capabilities";
import { getEnv as readEnv, EnvValidationError, parseEnv, type Env, type EnvIssue } from "./env";
import { loadEnvFile, readMergedEnv } from "./env-file";
import {
  ENV_REGISTRY,
  type AppMode,
  type EnvVarName,
  type EnvVarSpec,
  type RawEnv,
  type ServiceGroup,
} from "./registry";

export {
  ENV_REGISTRY,
  EnvValidationError,
  parseEnv,
  deriveCapabilities,
  loadEnvFile,
  readMergedEnv,
};
export type {
  AppMode,
  Capabilities,
  Env,
  EnvIssue,
  EnvVarName,
  EnvVarSpec,
  RawEnv,
  ServiceGroup,
  ServiceName,
};

function resolveMode(): AppMode {
  const nodeEnv = process.env.NODE_ENV;
  return nodeEnv === "production" || nodeEnv === "test" ? nodeEnv : "development";
}

/** Zod-validated, memoized (env.ts's own module-level cache). Throws `EnvValidationError`. */
export function getEnv(): Env {
  return readEnv();
}

let cachedCapabilities: Capabilities | undefined;

/**
 * Memoized derivation of the capability map over `getEnv()`. This entry keeps its own
 * memoization cache, separate from the "." entry's — the two are never loaded in the same
 * process (app code vs. Node scripts), so that's harmless.
 */
export function getCapabilities(): Capabilities {
  if (!cachedCapabilities) {
    cachedCapabilities = deriveCapabilities(getEnv(), resolveMode());
  }
  return cachedCapabilities;
}
