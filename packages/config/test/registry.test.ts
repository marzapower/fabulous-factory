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

  it("marks DATABASE_URL and BETTER_AUTH_SECRET as the required vars (M8: pg + auth is the minimum)", () => {
    const required = ENV_REGISTRY.filter((spec) => spec.required);
    expect(required.map((spec) => spec.name)).toEqual(["DATABASE_URL", "BETTER_AUTH_SECRET"]);
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
    // BETTER_AUTH_SECRET is the one deliberate exception (I.10.7): its example is the
    // EMPTY string, not a placeholder-looking one — required vars ship uncommented with
    // their example in `.env.example`, so any non-empty example here would be a working
    // default secret. Empty is strictly safer than a placeholder, so it's excluded from
    // this "looks like a placeholder" check rather than forced to satisfy it. Excluded by
    // name, not by `example === ""`, so a future secret var can't silently opt out of this
    // check just by shipping an empty example (I.10.7).
    for (const spec of ENV_REGISTRY.filter((s) => s.secret && s.name !== "BETTER_AUTH_SECRET")) {
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

  it("declares `enables` explicitly (boolean, never omitted) on every entry", () => {
    for (const spec of ENV_REGISTRY) {
      expect(typeof spec.enables, `${spec.name}.enables must be a boolean`).toBe("boolean");
    }
  });

  it("has a non-empty `enables` set for every service group doctor derives hints from (G.3.3/G.10.10)", () => {
    const serviceGroups = [
      "billing",
      "llm",
      "email",
      "jobs",
      "analytics",
      "observability",
    ] as const;
    for (const group of serviceGroups) {
      const enablers = ENV_REGISTRY.filter((spec) => spec.group === group && spec.enables);
      expect(enablers.length, `group '${group}' has no enables:true vars`).toBeGreaterThan(0);
    }
  });
});

describe("ENV_REGISTRY — auth vars (M2, required tier updated M8)", () => {
  const secretVars = ["BETTER_AUTH_SECRET", "GOOGLE_CLIENT_SECRET", "GITHUB_CLIENT_SECRET"];
  const nonSecretVars = ["GOOGLE_CLIENT_ID", "GITHUB_CLIENT_ID"];

  it("registers all five auth vars in the 'auth' group; only BETTER_AUTH_SECRET is required", () => {
    for (const name of [...secretVars, ...nonSecretVars]) {
      const spec = ENV_REGISTRY.find((s) => s.name === name);
      expect(spec, `${name} missing from ENV_REGISTRY`).toBeDefined();
      expect(spec?.group).toBe("auth");
      expect(spec?.required).toBe(name === "BETTER_AUTH_SECRET");
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

  // Positive coverage for the M8 contract change (I.3.a, I.10.8): BETTER_AUTH_SECRET is
  // now required, exactly like DATABASE_URL — "pg + auth is the minimum".
  it("requires BETTER_AUTH_SECRET (M8 contract change)", () => {
    const spec = ENV_REGISTRY.find((s) => s.name === "BETTER_AUTH_SECRET");
    expect(spec?.required).toBe(true);
  });

  it("ships BETTER_AUTH_SECRET with an empty example, never a working default secret (I.10.7)", () => {
    const spec = ENV_REGISTRY.find((s) => s.name === "BETTER_AUTH_SECRET");
    expect(spec?.example).toBe("");
  });
});
