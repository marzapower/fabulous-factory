import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { stampProvenance } from "../src/lib/provenance-stamp";

let targetDir: string;

beforeEach(() => {
  targetDir = mkdtempSync(path.join(tmpdir(), "fabulous-factory-provenance-"));
  mkdirSync(path.join(targetDir, ".factory"), { recursive: true });
});

afterEach(() => {
  rmSync(targetDir, { recursive: true, force: true });
});

function readConfig(): unknown {
  return JSON.parse(readFileSync(path.join(targetDir, ".factory", "config.json"), "utf8"));
}

describe("stampProvenance", () => {
  it("rewrites the compose-time seed into { stage, preset, factoryVersion }", () => {
    writeFileSync(path.join(targetDir, ".factory", "config.json"), '{"stage":"prototype"}\n');

    stampProvenance(targetDir, { preset: "untangle", factoryVersion: "0.3.0" });

    expect(readConfig()).toEqual({
      stage: "prototype",
      preset: "untangle",
      factoryVersion: "0.3.0",
    });
  });

  it("preserves an existing stage of 'production'", () => {
    writeFileSync(path.join(targetDir, ".factory", "config.json"), '{"stage":"production"}\n');

    stampProvenance(targetDir, { preset: "nothing", factoryVersion: "0.3.0" });

    expect(readConfig()).toEqual({
      stage: "production",
      preset: "nothing",
      factoryVersion: "0.3.0",
    });
  });

  it("defaults to stage 'prototype' when config.json is missing", () => {
    stampProvenance(targetDir, { preset: "brainstorm", factoryVersion: "0.3.0" });

    expect(readConfig()).toEqual({
      stage: "prototype",
      preset: "brainstorm",
      factoryVersion: "0.3.0",
    });
  });

  it("defaults to stage 'prototype' when config.json is unparseable", () => {
    writeFileSync(path.join(targetDir, ".factory", "config.json"), "not json");

    stampProvenance(targetDir, { preset: "untangle", factoryVersion: "0.3.0" });

    expect(readConfig()).toEqual({
      stage: "prototype",
      preset: "untangle",
      factoryVersion: "0.3.0",
    });
  });
});
