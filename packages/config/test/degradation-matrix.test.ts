import { describe, expect, it } from "vitest";

import { deriveCapabilities, type Capabilities, type ServiceName } from "../src/capabilities";
import { ENV_REGISTRY, type EnvVarSpec, type RawEnv } from "../src/registry";

/**
 * Declarative degradation matrix (plan K.1.7, the graceful-degradation contract owed
 * since M4): baseline env (the required minimum only) leaves every optional service
 * disabled; each service's own `enables` var(s) — read straight off `ENV_REGISTRY`, never
 * hardcoded here — light up exactly that service and nothing else; the full env lights
 * up everything. "production" mode throughout, since `email`/`jobs` have mode-dependent
 * dev fallbacks (capabilities.test.ts) that would otherwise make "baseline → all
 * disabled" untrue.
 */

const BASELINE: RawEnv = {
  DATABASE_URL: "postgres://postgres:changeme@localhost:5432/fabulous_factory_dev",
  BETTER_AUTH_SECRET: "a-generated-secret-at-least-16-chars",
};

const ALL_DISABLED: Capabilities = {
  billing: "disabled",
  llm: "disabled",
  email: "disabled",
  jobs: "disabled",
  analytics: "disabled",
  errors: "disabled",
};

const SERVICES = Object.keys(ALL_DISABLED) as ServiceName[];

// The only place `Capabilities`'s `errors` key and `ENV_REGISTRY`'s `observability` group
// name diverge — every other service name matches its registry group 1:1.
const SERVICE_GROUPS: Record<ServiceName, EnvVarSpec["group"]> = {
  billing: "billing",
  llm: "llm",
  email: "email",
  jobs: "jobs",
  analytics: "analytics",
  errors: "observability",
};

function enablingVarsFor(service: ServiceName): string[] {
  const group = SERVICE_GROUPS[service];
  return ENV_REGISTRY.filter((spec) => spec.group === group && spec.enables).map(
    (spec) => spec.name,
  );
}

function withVars(names: string[]): RawEnv {
  const env: Record<string, string> = { ...BASELINE };
  for (const name of names) {
    env[name] = "test-value";
  }
  return env;
}

describe("degradation matrix (plan K.1.7)", () => {
  it("baseline env only (DATABASE_URL + BETTER_AUTH_SECRET) → every optional service disabled", () => {
    expect(deriveCapabilities(BASELINE, "production")).toEqual(ALL_DISABLED);
  });

  it.each(SERVICES)(
    "baseline + only %s's enabling var(s) → exactly %s lights up, all others stay disabled",
    (service) => {
      const vars = enablingVarsFor(service);
      expect(vars.length, `${service} has no ENV_REGISTRY enables:true vars`).toBeGreaterThan(0);

      const result = deriveCapabilities(withVars(vars), "production");

      for (const other of SERVICES) {
        if (other === service) {
          expect(result[other], `${service} should be enabled`).not.toBe("disabled");
        } else {
          expect(
            result[other],
            `${other} should stay disabled when only ${service} is configured`,
          ).toBe("disabled");
        }
      }
    },
  );

  it("full env (every enabling var across every service) → every service enabled", () => {
    const allEnablingVars = ENV_REGISTRY.filter((spec) => spec.enables).map((spec) => spec.name);
    const result = deriveCapabilities(withVars(allEnablingVars), "production");

    for (const service of SERVICES) {
      expect(result[service], `${service} should be enabled`).not.toBe("disabled");
    }
  });
});
