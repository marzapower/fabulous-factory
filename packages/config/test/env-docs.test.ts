import { describe, expect, it } from "vitest";

import type { ServiceName } from "../src/capabilities";
import { getEnvDocsForGroup, serviceHints, SERVICE_GROUPS } from "../src/env-docs";
import { ENV_REGISTRY, type ServiceGroup } from "../src/registry";

const VALID_GROUPS = new Set<ServiceGroup>([
  "core",
  "auth",
  "billing",
  "llm",
  "email",
  "jobs",
  "analytics",
  "observability",
]);

describe("SERVICE_GROUPS", () => {
  it("maps every ServiceName to a group that exists in the registry", () => {
    for (const [service, group] of Object.entries(SERVICE_GROUPS) as [
      ServiceName,
      ServiceGroup,
    ][]) {
      expect(VALID_GROUPS.has(group), `${service} maps to unknown group '${group}'`).toBe(true);
    }
  });
});

describe("getEnvDocsForGroup", () => {
  it("returns the Stripe specs for 'billing' and nothing from other groups", () => {
    const names = getEnvDocsForGroup("billing").map((spec) => spec.name);
    expect(names).toEqual(["BILLING_PROVIDER", "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"]);
    for (const spec of getEnvDocsForGroup("billing")) {
      expect(spec.group).toBe("billing");
    }
  });

  it("returns every registry spec of the group, in registry order", () => {
    for (const group of VALID_GROUPS) {
      const expected = ENV_REGISTRY.filter((spec) => spec.group === group);
      expect(getEnvDocsForGroup(group).map((spec) => spec.name)).toEqual(
        expected.map((spec) => spec.name),
      );
    }
  });

  it("returns the registry's own spec objects — no value field", () => {
    for (const spec of getEnvDocsForGroup("billing")) {
      expect(spec).not.toHaveProperty("value");
      expect(ENV_REGISTRY).toContainEqual(spec);
    }
  });
});

describe("serviceHints", () => {
  it("returns only specs with `enables` set, for the mapped group", () => {
    for (const service of Object.keys(SERVICE_GROUPS) as ServiceName[]) {
      const hints = serviceHints(service);
      const group = SERVICE_GROUPS[service];
      for (const spec of hints) {
        expect(spec.group).toBe(group);
        expect(spec.enables).toBe(true);
      }
    }
  });

  it("matches a direct filter of ENV_REGISTRY by group + enables", () => {
    for (const service of Object.keys(SERVICE_GROUPS) as ServiceName[]) {
      const group = SERVICE_GROUPS[service];
      const expected = ENV_REGISTRY.filter((spec) => spec.group === group && spec.enables);
      expect(serviceHints(service).map((spec) => spec.name)).toEqual(
        expected.map((spec) => spec.name),
      );
    }
  });

  it("returns no value field on any hint", () => {
    for (const service of Object.keys(SERVICE_GROUPS) as ServiceName[]) {
      for (const spec of serviceHints(service)) {
        expect(spec).not.toHaveProperty("value");
      }
    }
  });
});
