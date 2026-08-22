import { describe, expect, it } from "vitest";

import {
  DOCKERFILE_DOMAIN_PACKAGE_MARKER,
  stampDockerfileDomainPackages,
} from "../src/lib/dockerfile-stamp";

describe("stampDockerfileDomainPackages", () => {
  it("replaces the marker line with one COPY line per claimed domain package", () => {
    const dockerfile = [
      "COPY packages/core/package.json packages/core/package.json",
      DOCKERFILE_DOMAIN_PACKAGE_MARKER,
      "COPY packages/db/package.json packages/db/package.json",
    ].join("\n");

    const stamped = stampDockerfileDomainPackages(dockerfile, ["untangle"]);

    expect(stamped).toBe(
      [
        "COPY packages/core/package.json packages/core/package.json",
        "COPY packages/untangle/package.json packages/untangle/package.json",
        "COPY packages/db/package.json packages/db/package.json",
      ].join("\n"),
    );
  });

  it("stamps one COPY line per package, in order, for multiple claimed packages", () => {
    const dockerfile = ["before", DOCKERFILE_DOMAIN_PACKAGE_MARKER, "after"].join("\n");

    const stamped = stampDockerfileDomainPackages(dockerfile, ["untangle", "brainstorm"]);

    expect(stamped).toBe(
      [
        "before",
        "COPY packages/untangle/package.json packages/untangle/package.json",
        "COPY packages/brainstorm/package.json packages/brainstorm/package.json",
        "after",
      ].join("\n"),
    );
  });

  it("removes the marker line entirely for an empty package list", () => {
    const dockerfile = ["before", DOCKERFILE_DOMAIN_PACKAGE_MARKER, "after"].join("\n");

    expect(stampDockerfileDomainPackages(dockerfile, [])).toBe(["before", "after"].join("\n"));
  });

  it("throws a clear error when the marker is missing", () => {
    expect(() => stampDockerfileDomainPackages("no marker here", ["untangle"])).toThrow(
      /preset:domain-package-manifests.*insertion marker/,
    );
  });

  it("supports a custom marker string", () => {
    const stamped = stampDockerfileDomainPackages(
      "before\n<<HERE>>\nafter",
      ["untangle"],
      "<<HERE>>",
    );
    expect(stamped).toBe(
      "before\nCOPY packages/untangle/package.json packages/untangle/package.json\nafter",
    );
  });
});
