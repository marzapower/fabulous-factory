import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { ENV_REGISTRY } from "../src/registry";
import { GROUP_ORDER, generateEnvExample, isEnvExampleUpToDate } from "../scripts/gen-env-example";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_ENV_EXAMPLE_PATH = path.resolve(__dirname, "../../../.env.example");

describe("generateEnvExample", () => {
  it("is deterministic across calls", () => {
    expect(generateEnvExample()).toBe(generateEnvExample());
  });

  it("contains every registered var name", () => {
    const output = generateEnvExample();
    for (const spec of ENV_REGISTRY) {
      expect(output, `missing ${spec.name}`).toContain(spec.name);
    }
  });

  it("emits the required var uncommented, with its example value", () => {
    const output = generateEnvExample();
    const requiredNames = ENV_REGISTRY.filter((spec) => spec.required).map((spec) => spec.name);
    expect(requiredNames).toEqual(["DATABASE_URL"]);
    const databaseUrl = ENV_REGISTRY.find((spec) => spec.name === "DATABASE_URL")!;
    expect(output).toContain(`\nDATABASE_URL=${databaseUrl.example}\n`);
  });

  it("comments out every optional var", () => {
    const output = generateEnvExample();
    for (const spec of ENV_REGISTRY.filter((s) => !s.required)) {
      expect(output, `${spec.name} should be commented out`).toContain(`# ${spec.name}=`);
      expect(output, `${spec.name} must not appear uncommented`).not.toContain(`\n${spec.name}=`);
    }
  });

  it("precedes every var with its description as a comment", () => {
    const output = generateEnvExample();
    for (const spec of ENV_REGISTRY) {
      expect(output, `${spec.name} missing its description comment`).toContain(
        `# ${spec.description}`,
      );
    }
  });

  it("groups vars under their ServiceGroup, in declared order", () => {
    const output = generateEnvExample();
    const order = [
      "Core",
      "Auth",
      "Billing",
      "LLM gateway",
      "Email",
      "Jobs",
      "Analytics",
      "Observability",
    ];
    let lastIndex = -1;
    for (const title of order) {
      const index = output.indexOf(title);
      expect(index, `${title} section missing`).toBeGreaterThan(-1);
      expect(index, `${title} section out of order`).toBeGreaterThan(lastIndex);
      lastIndex = index;
    }
  });

  it("matches the checked-in root .env.example exactly (golden file)", () => {
    const disk = readFileSync(ROOT_ENV_EXAMPLE_PATH, "utf8");
    expect(disk).toBe(generateEnvExample());
  });

  it("has every ENV_REGISTRY group represented in GROUP_ORDER (else vars silently drop)", () => {
    const usedGroups = new Set(ENV_REGISTRY.map((spec) => spec.group));
    for (const group of usedGroups) {
      expect(
        GROUP_ORDER,
        `${group} is used in ENV_REGISTRY but missing from GROUP_ORDER`,
      ).toContain(group);
    }
  });
});

describe("isEnvExampleUpToDate", () => {
  it("is true for freshly generated content", () => {
    expect(isEnvExampleUpToDate(generateEnvExample())).toBe(true);
  });

  it("is false when the disk content drifts from the registry", () => {
    expect(isEnvExampleUpToDate("# stale content\nDATABASE_URL=old\n")).toBe(false);
  });

  it("is false when the file is missing entirely (empty string)", () => {
    expect(isEnvExampleUpToDate("")).toBe(false);
  });
});
