import { describe, expect, it } from "vitest";

import { ENV_REGISTRY } from "../src/registry";

describe("ENV_REGISTRY invariants", () => {
  it("has unique var names", () => {
    const names = ENV_REGISTRY.map((spec) => spec.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("includes DATABASE_URL", () => {
    const databaseUrl = ENV_REGISTRY.find((spec) => spec.name === "DATABASE_URL");
    expect(databaseUrl).toBeDefined();
  });

  it("marks DATABASE_URL as the only required var", () => {
    const required = ENV_REGISTRY.filter((spec) => spec.required);
    expect(required).toHaveLength(1);
    expect(required[0]?.name).toBe("DATABASE_URL");
  });

  it("gives every var a non-empty description", () => {
    for (const spec of ENV_REGISTRY) {
      expect(spec.description.length, `${spec.name} has no description`).toBeGreaterThan(0);
    }
  });

  it("gives every var a group", () => {
    const validGroups = new Set([
      "core",
      "auth",
      "billing",
      "llm",
      "email",
      "jobs",
      "analytics",
      "observability",
    ]);
    for (const spec of ENV_REGISTRY) {
      expect(validGroups.has(spec.group), `${spec.name} has an invalid group: ${spec.group}`).toBe(
        true,
      );
    }
  });

  it("never carries a real-looking secret as an example value", () => {
    // Examples must read as obvious placeholders — not something a scanner (or a
    // careless copy-paste) would mistake for a live credential. Deliberately excludes
    // "sk_test_": a real Stripe test-mode secret key also starts with that prefix, so it
    // doesn't prove an example is a placeholder.
    const placeholderMarkers = ["your", "changeme", "example", "signkey-"];
    for (const spec of ENV_REGISTRY.filter((s) => s.secret)) {
      expect(spec.example, `${spec.name} secret must have an example`).toBeDefined();
      const looksLikePlaceholder = placeholderMarkers.some((marker) =>
        spec.example!.toLowerCase().includes(marker),
      );
      expect(
        looksLikePlaceholder,
        `${spec.name} example "${spec.example}" doesn't look like an obvious placeholder`,
      ).toBe(true);
    }
  });

  it("covers every service group used by later milestones", () => {
    const groups = new Set(ENV_REGISTRY.map((spec) => spec.group));
    expect(groups).toEqual(
      new Set(["core", "auth", "billing", "llm", "email", "jobs", "analytics", "observability"]),
    );
  });
});

describe("ENV_REGISTRY — auth vars (M2)", () => {
  const secretVars = ["BETTER_AUTH_SECRET", "GOOGLE_CLIENT_SECRET", "GITHUB_CLIENT_SECRET"];
  const nonSecretVars = ["GOOGLE_CLIENT_ID", "GITHUB_CLIENT_ID"];

  it("registers all five auth vars in the 'auth' group, none required", () => {
    for (const name of [...secretVars, ...nonSecretVars]) {
      const spec = ENV_REGISTRY.find((s) => s.name === name);
      expect(spec, `${name} missing from ENV_REGISTRY`).toBeDefined();
      expect(spec?.group).toBe("auth");
      expect(spec?.required).toBe(false);
    }
  });

  it("marks BETTER_AUTH_SECRET and both OAuth client secrets as secret", () => {
    for (const name of secretVars) {
      expect(ENV_REGISTRY.find((s) => s.name === name)?.secret).toBe(true);
    }
  });

  it("does not mark either OAuth client ID as secret", () => {
    for (const name of nonSecretVars) {
      expect(ENV_REGISTRY.find((s) => s.name === name)?.secret).toBe(false);
    }
  });
});
