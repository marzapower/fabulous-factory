import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { discoverDomainChains } from "../scripts/migrate";

let migrationsFolder: string;

beforeEach(() => {
  migrationsFolder = mkdtempSync(path.join(tmpdir(), "migrate-discovery-test-"));
});

afterEach(() => {
  rmSync(migrationsFolder, { recursive: true, force: true });
});

/** Makes `<migrationsFolder>/<name>` look like a real Drizzle migration chain directory. */
function makeChain(name: string): void {
  const journalDir = path.join(migrationsFolder, name, "meta");
  mkdirSync(journalDir, { recursive: true });
  writeFileSync(path.join(journalDir, "_journal.json"), "{}");
}

describe("discoverDomainChains", () => {
  it("returns [] when the migrations folder itself doesn't exist", () => {
    rmSync(migrationsFolder, { recursive: true, force: true });
    expect(discoverDomainChains(migrationsFolder)).toEqual([]);
  });

  it("returns [] when the migrations folder has zero domain chains (e.g. only the shared chain's own files)", () => {
    mkdirSync(path.join(migrationsFolder, "meta"), { recursive: true });
    writeFileSync(path.join(migrationsFolder, "0000_shared.sql"), "-- shared chain");
    expect(discoverDomainChains(migrationsFolder)).toEqual([]);
  });

  it("discovers a single domain chain", () => {
    makeChain("untangle");
    expect(discoverDomainChains(migrationsFolder)).toEqual(["untangle"]);
  });

  it("discovers many domain chains, sorted alphabetically regardless of creation order", () => {
    makeChain("untangle");
    makeChain("brainstorm");
    expect(discoverDomainChains(migrationsFolder)).toEqual(["brainstorm", "untangle"]);
  });

  it("never mistakes the shared chain's own meta/ directory for a domain chain", () => {
    // The shared root chain's `meta/_journal.json` lives directly under `migrationsFolder`,
    // not inside a further `meta/meta/_journal.json` — so `meta/` itself must never be
    // returned as a discovered "domain".
    mkdirSync(path.join(migrationsFolder, "meta"), { recursive: true });
    writeFileSync(path.join(migrationsFolder, "meta", "_journal.json"), "{}");
    makeChain("untangle");
    expect(discoverDomainChains(migrationsFolder)).toEqual(["untangle"]);
  });

  it("ignores a directory with no meta/_journal.json", () => {
    mkdirSync(path.join(migrationsFolder, "not-a-chain"), { recursive: true });
    makeChain("untangle");
    expect(discoverDomainChains(migrationsFolder)).toEqual(["untangle"]);
  });

  it("throws a clear error for a domain name that risks Postgres identifier truncation", () => {
    const tooLong = "a".repeat(41);
    makeChain(tooLong);
    expect(() => discoverDomainChains(migrationsFolder)).toThrow(/40/);
  });
});
