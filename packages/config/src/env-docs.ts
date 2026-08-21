/**
 * Env metadata selectors — pure derivations over `ENV_REGISTRY`, no `process.env` reads,
 * no side effects. Extracted out of `scripts/doctor.ts` (which originally owned these) so
 * server components can consume the same registry-derived hints doctor prints, without
 * doctor's CLI-only concerns (masking, `console.log`, `readMergedEnv()`, …).
 *
 * These functions return metadata specs only (name/description/example/required/secret/
 * enables) — never a resolved value. Resolving actual env values stays `getEnv()`'s job.
 */
import type { ServiceName } from "./capabilities";
import { ENV_REGISTRY, type EnvVarSpec, type ServiceGroup } from "./registry";

// `ServiceName` (capabilities.ts) and `ServiceGroup` (registry.ts) are two different
// vocabularies for the same six optional services — this is the one place that maps
// between them. `errors` (the capability name) corresponds to the `observability`
// registry group; every other pair shares its name.
export const SERVICE_GROUPS: Record<ServiceName, ServiceGroup> = {
  billing: "billing",
  llm: "llm",
  email: "email",
  jobs: "jobs",
  analytics: "analytics",
  errors: "observability",
};

/** Every registry spec belonging to `group`, in registry order. */
export function getEnvDocsForGroup(group: ServiceGroup): readonly EnvVarSpec[] {
  return ENV_REGISTRY.filter((spec) => spec.group === group);
}

/**
 * Registry-derived enablement hints for a service (plan G.3.3/G.10.10) — replaces a
 * hand-maintained shadow map that could (and did) drift from the registry.
 */
export function serviceHints(service: ServiceName): readonly EnvVarSpec[] {
  const group = SERVICE_GROUPS[service];
  return getEnvDocsForGroup(group).filter((spec) => spec.enables);
}
