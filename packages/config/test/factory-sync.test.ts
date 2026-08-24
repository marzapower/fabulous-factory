/**
 * `factory-sync.ts` — unit tests for the fs/exec side that doesn't need the network
 * (`parseSyncArgs`, `readLocalProvenance`, `readLocalManifest`, `collectFilesUnderPrefixes`,
 * `stampFactoryVersion`, `applyActions`), plus a smoke test exercising `mergeFile`'s real
 * `git merge-file` path against local fixture dirs — no `npm pack`, no network.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  applyActions,
  collectFilesUnderPrefixes,
  mergeFile,
  parseSyncArgs,
  readLocalManifest,
  readLocalProvenance,
  readPackedVersion,
  runSync,
  stampFactoryVersion,
  validateVersionSpec,
} from "../scripts/factory-sync";

describe("parseSyncArgs", () => {
  it("defaults dryRun/allowDirty to false and leaves the rest undefined", () => {
    expect(parseSyncArgs([])).toEqual({ dryRun: false, allowDirty: false });
  });

  it("parses every flag", () => {
    expect(
      parseSyncArgs([
        "--to",
        "0.4.0",
        "--from",
        "0.3.0",
        "--preset",
        "untangle",
        "--dry-run",
        "--allow-dirty",
      ]),
    ).toEqual({
      to: "0.4.0",
      from: "0.3.0",
      preset: "untangle",
      dryRun: true,
      allowDirty: true,
    });
  });

  it("throws a clear error for a flag missing its value", () => {
    expect(() => parseSyncArgs(["--to"])).toThrow(/Missing value for --to/);
  });

  it("throws on an unknown argument", () => {
    expect(() => parseSyncArgs(["--bogus"])).toThrow(/Unknown argument: --bogus/);
  });
});

let repoRoot: string;

beforeEach(() => {
  repoRoot = mkdtempSync(path.join(tmpdir(), "factory-sync-test-"));
});

afterEach(() => {
  rmSync(repoRoot, { recursive: true, force: true });
});

describe("readLocalProvenance", () => {
  it("reads preset/factoryVersion from .factory/config.json", () => {
    mkdirSync(path.join(repoRoot, ".factory"), { recursive: true });
    writeFileSync(
      path.join(repoRoot, ".factory", "config.json"),
      JSON.stringify({ stage: "prototype", preset: "untangle", factoryVersion: "0.3.0" }),
    );
    expect(readLocalProvenance(repoRoot)).toEqual({ preset: "untangle", factoryVersion: "0.3.0" });
  });

  it("degrades to {} when the file is missing", () => {
    expect(readLocalProvenance(repoRoot)).toEqual({});
  });

  it("degrades to {} when the file is unparseable, never throws", () => {
    mkdirSync(path.join(repoRoot, ".factory"), { recursive: true });
    writeFileSync(path.join(repoRoot, ".factory", "config.json"), "not json");
    expect(() => readLocalProvenance(repoRoot)).not.toThrow();
    expect(readLocalProvenance(repoRoot)).toEqual({});
  });

  it("drops non-string preset/factoryVersion fields instead of returning them", () => {
    mkdirSync(path.join(repoRoot, ".factory"), { recursive: true });
    writeFileSync(
      path.join(repoRoot, ".factory", "config.json"),
      JSON.stringify({ preset: 1, factoryVersion: null }),
    );
    expect(readLocalProvenance(repoRoot)).toEqual({});
  });
});

describe("readLocalManifest", () => {
  it("parses a valid manifest file", () => {
    mkdirSync(path.join(repoRoot, ".factory"), { recursive: true });
    writeFileSync(
      path.join(repoRoot, ".factory", "sync-manifest.json"),
      JSON.stringify({ version: 1, paths: ["packages/core/"] }),
    );
    expect(readLocalManifest(repoRoot)).toEqual({ version: 1, paths: ["packages/core/"] });
  });

  it("throws an actionable error when the manifest is missing entirely", () => {
    expect(() => readLocalManifest(repoRoot)).toThrow(/predates the factory:sync channel/);
  });
});

describe("collectFilesUnderPrefixes", () => {
  it("collects every file under a directory prefix, recursively", () => {
    mkdirSync(path.join(repoRoot, "tracked", "nested"), { recursive: true });
    writeFileSync(path.join(repoRoot, "tracked", "a.ts"), "a");
    writeFileSync(path.join(repoRoot, "tracked", "nested", "b.ts"), "b");
    writeFileSync(path.join(repoRoot, "untracked.ts"), "nope");

    expect(collectFilesUnderPrefixes(repoRoot, ["tracked/"])).toEqual({
      "tracked/a.ts": "a",
      "tracked/nested/b.ts": "b",
    });
  });

  it("collects an exact-file prefix", () => {
    writeFileSync(path.join(repoRoot, "eslint.factory-rules.mjs"), "rules");
    expect(collectFilesUnderPrefixes(repoRoot, ["eslint.factory-rules.mjs"])).toEqual({
      "eslint.factory-rules.mjs": "rules",
    });
  });

  it("is empty when the prefix doesn't exist on disk", () => {
    expect(collectFilesUnderPrefixes(repoRoot, ["missing/"])).toEqual({});
  });

  it("skips an exact-file entry that is a symlink instead of following it", () => {
    const secretPath = path.join(repoRoot, "secret.txt");
    writeFileSync(secretPath, "top secret local content");
    symlinkSync(secretPath, path.join(repoRoot, "eslint.factory-rules.mjs"));

    expect(collectFilesUnderPrefixes(repoRoot, ["eslint.factory-rules.mjs"])).toEqual({});
  });

  it("ignores node_modules/dist/.next/.turbo anywhere under a directory prefix", () => {
    mkdirSync(path.join(repoRoot, "tracked", "node_modules", "some-dep"), { recursive: true });
    writeFileSync(
      path.join(repoRoot, "tracked", "node_modules", "some-dep", "index.js"),
      "installed",
    );
    mkdirSync(path.join(repoRoot, "tracked", "dist"), { recursive: true });
    writeFileSync(path.join(repoRoot, "tracked", "dist", "out.js"), "built");
    mkdirSync(path.join(repoRoot, "tracked", ".next"), { recursive: true });
    writeFileSync(path.join(repoRoot, "tracked", ".next", "trace"), "generated");
    mkdirSync(path.join(repoRoot, "tracked", ".turbo"), { recursive: true });
    writeFileSync(path.join(repoRoot, "tracked", ".turbo", "cache.json"), "cache");
    mkdirSync(path.join(repoRoot, "tracked", "nested", "node_modules"), { recursive: true });
    writeFileSync(path.join(repoRoot, "tracked", "nested", "node_modules", "x.js"), "nested-dep");
    writeFileSync(path.join(repoRoot, "tracked", "a.ts"), "a");

    expect(collectFilesUnderPrefixes(repoRoot, ["tracked/"])).toEqual({
      "tracked/a.ts": "a",
    });
  });
});

describe("validateVersionSpec", () => {
  it("accepts the literal 'latest'", () => {
    expect(validateVersionSpec("latest", "--to flag")).toBe("latest");
  });

  it("accepts strict semver", () => {
    expect(validateVersionSpec("1.2.3", "--from flag")).toBe("1.2.3");
  });

  it("accepts strict semver with a prerelease segment", () => {
    expect(validateVersionSpec("1.2.3-beta.1", "--from flag")).toBe("1.2.3-beta.1");
  });

  it("rejects a bare major.minor version", () => {
    expect(() => validateVersionSpec("1.2", "--to flag")).toThrow(/Invalid version "1.2"/);
  });

  it("rejects a range specifier", () => {
    expect(() => validateVersionSpec("^1.2.3", "--to flag")).toThrow(/Invalid version/);
  });

  it("rejects a git/file/URL spec, naming the offending value's source", () => {
    expect(() =>
      validateVersionSpec("file:/tmp/evil.tgz", ".factory/config.json's factoryVersion"),
    ).toThrow(/Invalid version "file:\/tmp\/evil\.tgz" from \.factory\/config\.json/);
  });

  it("rejects an npm dist-tag other than 'latest'", () => {
    expect(() => validateVersionSpec("next", "--to flag")).toThrow(/Invalid version "next"/);
  });
});

describe("stampFactoryVersion", () => {
  it("updates factoryVersion in place, preserving other fields", () => {
    mkdirSync(path.join(repoRoot, ".factory"), { recursive: true });
    writeFileSync(
      path.join(repoRoot, ".factory", "config.json"),
      JSON.stringify({ stage: "prototype", preset: "untangle", factoryVersion: "0.3.0" }),
    );

    stampFactoryVersion(repoRoot, "0.4.0");

    expect(
      JSON.parse(readFileSync(path.join(repoRoot, ".factory", "config.json"), "utf8")),
    ).toEqual({ stage: "prototype", preset: "untangle", factoryVersion: "0.4.0" });
  });

  it("creates the field from scratch when config.json is missing", () => {
    mkdirSync(path.join(repoRoot, ".factory"), { recursive: true });
    stampFactoryVersion(repoRoot, "0.4.0");
    expect(
      JSON.parse(readFileSync(path.join(repoRoot, ".factory", "config.json"), "utf8")),
    ).toEqual({ factoryVersion: "0.4.0" });
  });
});

describe("readPackedVersion", () => {
  it("reads version from an extracted package root's package.json", () => {
    writeFileSync(path.join(repoRoot, "package.json"), JSON.stringify({ version: "1.2.3" }));
    expect(readPackedVersion(repoRoot)).toBe("1.2.3");
  });

  it("throws when package.json has no version field", () => {
    writeFileSync(path.join(repoRoot, "package.json"), JSON.stringify({}));
    expect(() => readPackedVersion(repoRoot)).toThrow(/no "version" field/);
  });
});

const hasGit = (() => {
  try {
    execFileSync("git", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

describe.skipIf(!hasGit)("mergeFile (smoke test — real git merge-file, no network)", () => {
  it("cleanly merges non-overlapping changes", () => {
    const base = "line1\nline2\nline3\n";
    const target = "line1\nline2\nline3-upstream\n";
    const local = "line1-local\nline2\nline3\n";

    const result = mergeFile(base, target, local);

    expect(result.conflict).toBe(false);
    expect(result.content).toBe("line1-local\nline2\nline3-upstream\n");
  });

  it("reports a conflict, with markers, for overlapping changes", () => {
    const base = "line1\n";
    const target = "line1-upstream\n";
    const local = "line1-local\n";

    const result = mergeFile(base, target, local);

    expect(result.conflict).toBe(true);
    expect(result.content).toContain("<<<<<<<");
    expect(result.content).toContain("=======");
    expect(result.content).toContain(">>>>>>>");
  });

  it("treats a missing base as empty (independently-added file on both sides)", () => {
    const result = mergeFile(undefined, "upstream content\n", "upstream content\n");
    expect(result.conflict).toBe(false);
    expect(result.content).toBe("upstream content\n");
  });
});

describe("applyActions", () => {
  it("writes 'add' actions, deletes 'delete' actions, and skips 'skip' actions", () => {
    mkdirSync(path.join(repoRoot, "tracked"), { recursive: true });
    writeFileSync(path.join(repoRoot, "tracked", "old.ts"), "old content");

    const base = { "tracked/old.ts": "old content" };
    const target = { "tracked/new.ts": "new content" };
    const local = { "tracked/old.ts": "old content" };

    const result = applyActions(
      [
        { path: "tracked/new.ts", kind: "add" },
        { path: "tracked/old.ts", kind: "delete" },
      ],
      repoRoot,
      base,
      target,
      local,
      { dryRun: false },
    );

    expect(result).toEqual({
      applied: ["tracked/new.ts", "tracked/old.ts"],
      skipped: [],
      conflicts: [],
    });
    expect(readFileSync(path.join(repoRoot, "tracked", "new.ts"), "utf8")).toBe("new content");
    expect(() => readFileSync(path.join(repoRoot, "tracked", "old.ts"), "utf8")).toThrow();
  });

  it("dry-run never writes to disk", () => {
    const target = { "tracked/new.ts": "new content" };

    const result = applyActions(
      [{ path: "tracked/new.ts", kind: "add" }],
      repoRoot,
      {},
      target,
      {},
      { dryRun: true },
    );

    expect(result.applied).toEqual(["tracked/new.ts"]);
    expect(() => readFileSync(path.join(repoRoot, "tracked", "new.ts"), "utf8")).toThrow();
  });

  it("reports 'keep-deleted' actions as conflicts without touching disk", () => {
    const result = applyActions(
      [{ path: "tracked/x.ts", kind: "keep-deleted" }],
      repoRoot,
      {},
      {},
      {},
      { dryRun: false },
    );
    expect(result).toEqual({ applied: [], skipped: [], conflicts: ["tracked/x.ts"] });
  });
});

describe("runSync", () => {
  const preset = "untangle";

  /** Fakes `fetchPackedVersion` entirely — no `npm pack`, no network, no tar — building
   * a `templates/<preset>/` tree straight on disk under the caller-provided `workDir`
   * and a `package.json` stamped with `pkgVersion`, mirroring what `fetchPackedVersion`
   * itself returns (`workDir/package`). Keyed by the exact version string `runSync`
   * passes in, so `--from`/`--to` route to the right fixture. */
  function fakeFetchPackedVersion(
    byVersion: Record<string, { files: Record<string, string>; pkgVersion: string }>,
  ): typeof import("../scripts/factory-sync").fetchPackedVersion {
    return (version, workDir) => {
      const spec = byVersion[version];
      if (!spec) throw new Error(`unexpected version requested: ${version}`);
      const pkgRoot = path.join(workDir, "package");
      for (const [relPath, content] of Object.entries(spec.files)) {
        const full = path.join(pkgRoot, "templates", preset, relPath);
        mkdirSync(path.dirname(full), { recursive: true });
        writeFileSync(full, content);
      }
      mkdirSync(pkgRoot, { recursive: true });
      writeFileSync(
        path.join(pkgRoot, "package.json"),
        JSON.stringify({ version: spec.pkgVersion }),
      );
      return pkgRoot;
    };
  }

  function seedProvenanceAndManifest(): void {
    mkdirSync(path.join(repoRoot, ".factory"), { recursive: true });
    writeFileSync(
      path.join(repoRoot, ".factory", "config.json"),
      JSON.stringify({ stage: "prototype", preset, factoryVersion: "0.3.0" }),
    );
    writeFileSync(
      path.join(repoRoot, ".factory", "sync-manifest.json"),
      JSON.stringify({ version: 1, paths: ["tracked/"] }),
    );
  }

  function readStampedVersion(): unknown {
    return JSON.parse(readFileSync(path.join(repoRoot, ".factory", "config.json"), "utf8"))
      .factoryVersion;
  }

  it("conflicted apply: stamps factoryVersion to the target and exits 1", () => {
    seedProvenanceAndManifest();
    mkdirSync(path.join(repoRoot, "tracked"), { recursive: true });
    writeFileSync(path.join(repoRoot, "tracked", "foo.ts"), "line1-local\n");

    const fetchPackedVersion = fakeFetchPackedVersion({
      "0.3.0": { files: { "tracked/foo.ts": "line1\n" }, pkgVersion: "0.3.0" },
      "0.5.0": { files: { "tracked/foo.ts": "line1-upstream\n" }, pkgVersion: "0.5.0" },
    });

    const result = runSync(
      repoRoot,
      { to: "0.5.0", dryRun: false, allowDirty: true },
      { fetchPackedVersion },
    );

    expect(result.conflicts).toEqual(["tracked/foo.ts"]);
    expect(result.exitCode).toBe(1);
    expect(result.stampedVersion).toBe("0.5.0");
    expect(readStampedVersion()).toBe("0.5.0");
  });

  it("clean apply: stamps factoryVersion to the target and exits 0", () => {
    seedProvenanceAndManifest();
    mkdirSync(path.join(repoRoot, "tracked"), { recursive: true });
    writeFileSync(path.join(repoRoot, "tracked", "foo.ts"), "line1\n");

    const fetchPackedVersion = fakeFetchPackedVersion({
      "0.3.0": { files: { "tracked/foo.ts": "line1\n" }, pkgVersion: "0.3.0" },
      "0.5.0": { files: { "tracked/foo.ts": "line1\nline2-upstream\n" }, pkgVersion: "0.5.0" },
    });

    const result = runSync(
      repoRoot,
      { to: "0.5.0", dryRun: false, allowDirty: true },
      { fetchPackedVersion },
    );

    expect(result.conflicts).toEqual([]);
    expect(result.applied).toEqual(["tracked/foo.ts"]);
    expect(result.exitCode).toBe(0);
    expect(result.stampedVersion).toBe("0.5.0");
    expect(readStampedVersion()).toBe("0.5.0");
  });

  it("zero-action no-op: still stamps factoryVersion to the target", () => {
    seedProvenanceAndManifest();
    mkdirSync(path.join(repoRoot, "tracked"), { recursive: true });
    writeFileSync(path.join(repoRoot, "tracked", "foo.ts"), "unchanged\n");

    const fetchPackedVersion = fakeFetchPackedVersion({
      "0.3.0": { files: { "tracked/foo.ts": "unchanged\n" }, pkgVersion: "0.3.0" },
      "0.5.0": { files: { "tracked/foo.ts": "unchanged\n" }, pkgVersion: "0.5.0" },
    });

    const result = runSync(
      repoRoot,
      { to: "0.5.0", dryRun: false, allowDirty: true },
      { fetchPackedVersion },
    );

    expect(result.applied).toEqual([]);
    expect(result.skipped).toEqual(["tracked/foo.ts"]);
    expect(result.conflicts).toEqual([]);
    expect(result.exitCode).toBe(0);
    expect(result.stampedVersion).toBe("0.5.0");
    expect(readStampedVersion()).toBe("0.5.0");
  });

  it("dry run never stamps factoryVersion", () => {
    seedProvenanceAndManifest();
    mkdirSync(path.join(repoRoot, "tracked"), { recursive: true });
    writeFileSync(path.join(repoRoot, "tracked", "foo.ts"), "line1-local\n");

    const fetchPackedVersion = fakeFetchPackedVersion({
      "0.3.0": { files: { "tracked/foo.ts": "line1\n" }, pkgVersion: "0.3.0" },
      "0.5.0": { files: { "tracked/foo.ts": "line1-upstream\n" }, pkgVersion: "0.5.0" },
    });

    const result = runSync(
      repoRoot,
      { to: "0.5.0", dryRun: true, allowDirty: true },
      { fetchPackedVersion },
    );

    expect(result.stampedVersion).toBeUndefined();
    expect(readStampedVersion()).toBe("0.3.0");
  });
});
