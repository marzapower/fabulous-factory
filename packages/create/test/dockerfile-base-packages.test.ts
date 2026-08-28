/**
 * Drift guard (i18n plan §2.6 M11): both hand-maintained Dockerfiles hardcode a
 * `COPY packages/<pkg>/package.json packages/<pkg>/package.json` line per base package
 * (`compose.ts`'s dynamic `packages/*` scan means a NEW base package — like
 * `packages/i18n` — ships automatically through `composeBase`, but nothing enforces that
 * the two Dockerfiles were updated to match by hand). This test pins that the tracked
 * repo root `Dockerfile` and `payload/variants/Dockerfile` each carry exactly one COPY
 * line per base package the compose engine would actually copy — no more, no less —
 * using the SAME `listBasePackages` helper `compose.ts` itself calls, so a new package
 * under `packages/*` fails this test the moment it's added, not silently at deploy time.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { allDomainPackages, listBasePackages } from "../src/compose";
import { BASE_EXCLUDED_PACKAGES } from "../src/compose.config";
import { DOCKERFILE_DOMAIN_PACKAGE_MARKER } from "../src/lib/dockerfile-stamp";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

/** Every `COPY packages/<pkg>/package.json …` line's `<pkg>` segment, in file order. */
function copiedPackageNames(dockerfile: string): string[] {
  const names: string[] = [];
  for (const line of dockerfile.split("\n")) {
    const match = /^COPY packages\/([^/]+)\/package\.json packages\/\1\/package\.json$/.exec(
      line.trim(),
    );
    if (match) names.push(match[1]);
  }
  return names;
}

describe("root Dockerfile base-package manifests", () => {
  // Deviation from the i18n plan's literal `listBasePackages(repoRoot)` (default args):
  // the default excludes BASE_EXCLUDED_PACKAGES (`create`, `create-alias`), which is the
  // right exclusion for a COMPOSED adopter product (packages/create never ships to one),
  // but the repo-root Dockerfile builds THIS monorepo itself — `pnpm install
  // --frozen-lockfile` needs every workspace member's package.json (pnpm-workspace.yaml's
  // `packages/*` glob includes packages/create and packages/create-alias), so the root
  // Dockerfile has always COPYed their manifests too, pre-dating and unrelated to this
  // task. Excluding []: every packages/* directory, matching the file as it stands.
  it("COPYs exactly every packages/* base package, sorted", () => {
    const dockerfile = readFileSync(path.join(repoRoot, "Dockerfile"), "utf8");
    expect(copiedPackageNames(dockerfile)).toEqual(listBasePackages(repoRoot, []));
  });
});

describe("payload/variants/Dockerfile base-package manifests", () => {
  it("COPYs exactly the adopter base packages (base minus every preset's domain packages), sorted", () => {
    const dockerfilePath = path.join(repoRoot, "payload/variants/Dockerfile");
    const dockerfile = readFileSync(dockerfilePath, "utf8");
    const domainPackages = allDomainPackages(repoRoot);
    const expected = listBasePackages(repoRoot, [...BASE_EXCLUDED_PACKAGES, ...domainPackages]);

    expect(copiedPackageNames(dockerfile)).toEqual(expected);
  });

  it("still carries the domain-package-manifests insertion marker", () => {
    const dockerfilePath = path.join(repoRoot, "payload/variants/Dockerfile");
    const dockerfile = readFileSync(dockerfilePath, "utf8");

    expect(dockerfile).toContain(DOCKERFILE_DOMAIN_PACKAGE_MARKER);
  });
});
