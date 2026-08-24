/**
 * `factory-sync.ts` — unit tests for the pure, still-exported helpers (`parseSyncArgs`,
 * `validateVersionSpec`), plus integration-style coverage of `runSync`, the module's sole
 * remaining orchestration export. Every fs/exec collaborator `runSync` uses internally
 * (`isGitDirty`, `readLocalProvenance`, `readLocalManifest`, `collectFilesUnderPrefixes`,
 * `mergeFile`, `applyActions`, `stampFactoryVersion`, `readPackedVersion`) is
 * module-private now, so their behavior is exercised here through `runSync`'s real,
 * unmocked fs/git side — only `fetchPackedVersion` (the network call) is faked, per
 * `SyncRunDeps`'s "fake the network, exercise the real filesystem-backed pieces" split.
 */
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { parseSyncArgs, runSync, validateVersionSpec } from "../scripts/factory-sync";

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

let repoRoot: string;

beforeEach(() => {
  repoRoot = mkdtempSync(path.join(tmpdir(), "factory-sync-test-"));
});

afterEach(() => {
  rmSync(repoRoot, { recursive: true, force: true });
});

const hasGit = (() => {
  try {
    execFileSync("git", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

describe("runSync", () => {
  const preset = "untangle";

  /** Fakes `fetchPackedVersion` entirely — no `npm pack`, no network, no tar — building
   * a `templates/<preset>/` tree straight on disk under the caller-provided `workDir`
   * and a `package.json` stamped with `pkgVersion` (or omitted entirely, to exercise
   * `readPackedVersion`'s error path), mirroring what `fetchPackedVersion` itself returns
   * (`workDir/package`). Keyed by the exact version string `runSync` passes in, so
   * `--from`/`--to` route to the right fixture. Every other collaborator
   * (`collectFilesUnderPrefixes`, `mergeFile`, `applyActions`, `stampFactoryVersion`,
   * `readPackedVersion`, `isGitDirty`, `readLocalProvenance`, `readLocalManifest`) runs
   * for real against `repoRoot` and the fixture trees this builds. */
  function fakeFetchPackedVersion(
    byVersion: Record<string, { files: Record<string, string>; pkgVersion?: string }>,
  ) {
    return (version: string, workDir: string): string => {
      const spec = byVersion[version];
      if (!spec) throw new Error(`unexpected version requested: ${version}`);
      const pkgRoot = path.join(workDir, "package");
      // Always create templates/<preset>/ itself, even with zero files, so runSync's
      // "has no template for preset" existence check passes.
      mkdirSync(path.join(pkgRoot, "templates", preset), { recursive: true });
      for (const [relPath, content] of Object.entries(spec.files)) {
        const full = path.join(pkgRoot, "templates", preset, relPath);
        mkdirSync(path.dirname(full), { recursive: true });
        writeFileSync(full, content);
      }
      mkdirSync(pkgRoot, { recursive: true });
      // `pkgVersion: undefined` still writes a package.json — just one with no "version"
      // field, to exercise readPackedVersion's error path.
      writeFileSync(
        path.join(pkgRoot, "package.json"),
        JSON.stringify(spec.pkgVersion === undefined ? {} : { version: spec.pkgVersion }),
      );
      return pkgRoot;
    };
  }

  function seedProvenanceAndManifest(paths: string[] = ["tracked/"]): void {
    mkdirSync(path.join(repoRoot, ".factory"), { recursive: true });
    writeFileSync(
      path.join(repoRoot, ".factory", "config.json"),
      JSON.stringify({ stage: "prototype", preset, factoryVersion: "0.3.0" }),
    );
    writeFileSync(
      path.join(repoRoot, ".factory", "sync-manifest.json"),
      JSON.stringify({ version: 1, paths }),
    );
  }

  function readConfigJson(): unknown {
    return JSON.parse(readFileSync(path.join(repoRoot, ".factory", "config.json"), "utf8"));
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
    // Conflict markers land in the merged file on disk (mergeFile's real `git merge-file`
    // path, exercised for real here).
    const merged = readFileSync(path.join(repoRoot, "tracked", "foo.ts"), "utf8");
    expect(merged).toContain("<<<<<<<");
    expect(merged).toContain("=======");
    expect(merged).toContain(">>>>>>>");
    // stampFactoryVersion updates factoryVersion in place while preserving every other
    // field already in .factory/config.json.
    expect(readConfigJson()).toEqual({ stage: "prototype", preset, factoryVersion: "0.5.0" });
  });

  it("clean apply: three-way-merges non-overlapping changes and stamps the target version", () => {
    seedProvenanceAndManifest();
    mkdirSync(path.join(repoRoot, "tracked"), { recursive: true });
    writeFileSync(path.join(repoRoot, "tracked", "foo.ts"), "line1-local\nline2\nline3\n");

    const fetchPackedVersion = fakeFetchPackedVersion({
      "0.3.0": { files: { "tracked/foo.ts": "line1\nline2\nline3\n" }, pkgVersion: "0.3.0" },
      "0.5.0": {
        files: { "tracked/foo.ts": "line1\nline2\nline3-upstream\n" },
        pkgVersion: "0.5.0",
      },
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
    expect(readFileSync(path.join(repoRoot, "tracked", "foo.ts"), "utf8")).toBe(
      "line1-local\nline2\nline3-upstream\n",
    );
    expect(readConfigJson()).toEqual({ stage: "prototype", preset, factoryVersion: "0.5.0" });
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
  });

  it("dry run never stamps factoryVersion and never writes to disk", () => {
    seedProvenanceAndManifest();
    mkdirSync(path.join(repoRoot, "tracked"), { recursive: true });
    writeFileSync(path.join(repoRoot, "tracked", "foo.ts"), "line1-local\n");

    const fetchPackedVersion = fakeFetchPackedVersion({
      "0.3.0": { files: { "tracked/foo.ts": "line1\n" }, pkgVersion: "0.3.0" },
      "0.5.0": { files: { "tracked/new.ts": "new content\n" }, pkgVersion: "0.5.0" },
    });

    const result = runSync(
      repoRoot,
      { to: "0.5.0", dryRun: true, allowDirty: true },
      { fetchPackedVersion },
    );

    expect(result.stampedVersion).toBeUndefined();
    expect((readConfigJson() as { factoryVersion: string }).factoryVersion).toBe("0.3.0");
    // "add" action was planned (tracked/new.ts is upstream-only) but dry-run must not
    // write it.
    expect(result.applied).toContain("tracked/new.ts");
    expect(existsSync(path.join(repoRoot, "tracked", "new.ts"))).toBe(false);
  });

  it("treats a missing base as empty for a file added independently on both sides", () => {
    seedProvenanceAndManifest();
    mkdirSync(path.join(repoRoot, "tracked"), { recursive: true });
    writeFileSync(path.join(repoRoot, "tracked", "both.ts"), "upstream content\n");

    const fetchPackedVersion = fakeFetchPackedVersion({
      // "from" (base) never had tracked/both.ts at all.
      "0.3.0": { files: {}, pkgVersion: "0.3.0" },
      "0.5.0": { files: { "tracked/both.ts": "upstream content\n" }, pkgVersion: "0.5.0" },
    });

    const result = runSync(
      repoRoot,
      { to: "0.5.0", dryRun: false, allowDirty: true },
      { fetchPackedVersion },
    );

    expect(result.conflicts).toEqual([]);
    expect(readFileSync(path.join(repoRoot, "tracked", "both.ts"), "utf8")).toBe(
      "upstream content\n",
    );
  });

  it("ignores node_modules/dist/.next/.turbo under a directory prefix, on both the fetched and local trees", () => {
    seedProvenanceAndManifest();
    mkdirSync(path.join(repoRoot, "tracked"), { recursive: true });
    writeFileSync(path.join(repoRoot, "tracked", "foo.ts"), "unchanged\n");
    mkdirSync(path.join(repoRoot, "tracked", "node_modules", "dep"), { recursive: true });
    writeFileSync(path.join(repoRoot, "tracked", "node_modules", "dep", "index.js"), "installed");

    const fetchPackedVersion = fakeFetchPackedVersion({
      "0.3.0": { files: { "tracked/foo.ts": "unchanged\n" }, pkgVersion: "0.3.0" },
      "0.5.0": {
        files: {
          "tracked/foo.ts": "unchanged\n",
          // Present only in the upstream tarball's excluded dir — must never be diffed
          // or written into the repo.
          "tracked/node_modules/dep/index.js": "upstream installed",
        },
        pkgVersion: "0.5.0",
      },
    });

    const result = runSync(
      repoRoot,
      { to: "0.5.0", dryRun: false, allowDirty: true },
      { fetchPackedVersion },
    );

    expect(result.applied).not.toContain("tracked/node_modules/dep/index.js");
    expect(result.skipped).not.toContain("tracked/node_modules/dep/index.js");
    expect(result.conflicts).toEqual([]);
    // The local node_modules content is untouched — never overwritten by the "upstream"
    // fixture content that was correctly excluded from the diff.
    expect(
      readFileSync(path.join(repoRoot, "tracked", "node_modules", "dep", "index.js"), "utf8"),
    ).toBe("installed");
  });

  it("skips a symlinked exact-file entry instead of following it into the diff", () => {
    seedProvenanceAndManifest(["config.mjs"]);
    const secretPath = path.join(repoRoot, "secret.txt");
    writeFileSync(secretPath, "top secret local content\n");
    symlinkSync(secretPath, path.join(repoRoot, "config.mjs"));

    const fetchPackedVersion = fakeFetchPackedVersion({
      "0.3.0": { files: {}, pkgVersion: "0.3.0" },
      "0.5.0": { files: { "config.mjs": "target content\n" }, pkgVersion: "0.5.0" },
    });

    const result = runSync(
      repoRoot,
      { to: "0.5.0", dryRun: false, allowDirty: true },
      { fetchPackedVersion },
    );

    // Symlink correctly excluded from the local snapshot -> local reads as "absent" ->
    // "add" (never a "merge" that could pull the secret's real content into the diff).
    expect(result.conflicts).toEqual([]);
    expect(result.applied).toEqual(["config.mjs"]);
    const written = readFileSync(path.join(repoRoot, "config.mjs"), "utf8");
    expect(written).toBe("target content\n");
    expect(written).not.toContain("top secret");
  });

  it("throws an actionable error when preset/factoryVersion can't be determined and no overrides are given", () => {
    mkdirSync(path.join(repoRoot, ".factory"), { recursive: true });
    writeFileSync(
      path.join(repoRoot, ".factory", "sync-manifest.json"),
      JSON.stringify({ version: 1, paths: ["tracked/"] }),
    );

    expect(() => runSync(repoRoot, { dryRun: false, allowDirty: true })).toThrow(
      /couldn't determine this repo's preset\/factoryVersion/,
    );
  });

  it("throws when .factory/sync-manifest.json is missing entirely", () => {
    mkdirSync(path.join(repoRoot, ".factory"), { recursive: true });
    writeFileSync(
      path.join(repoRoot, ".factory", "config.json"),
      JSON.stringify({ preset, factoryVersion: "0.3.0" }),
    );

    expect(() => runSync(repoRoot, { to: "0.5.0", dryRun: false, allowDirty: true })).toThrow(
      /predates the factory:sync channel/,
    );
  });

  it("throws when the fetched target package.json has no version field", () => {
    seedProvenanceAndManifest();
    mkdirSync(path.join(repoRoot, "tracked"), { recursive: true });

    const fetchPackedVersion = fakeFetchPackedVersion({
      "0.3.0": { files: {}, pkgVersion: "0.3.0" },
      "0.5.0": { files: {} }, // no pkgVersion -> package.json has no "version" field
    });

    expect(() =>
      runSync(repoRoot, { to: "0.5.0", dryRun: false, allowDirty: true }, { fetchPackedVersion }),
    ).toThrow(/no "version" field/);
  });

  it("degrades to needing explicit --from/--preset when .factory/config.json is missing, and creates it on stamp", () => {
    mkdirSync(path.join(repoRoot, ".factory"), { recursive: true });
    writeFileSync(
      path.join(repoRoot, ".factory", "sync-manifest.json"),
      JSON.stringify({ version: 1, paths: ["tracked/"] }),
    );
    mkdirSync(path.join(repoRoot, "tracked"), { recursive: true });

    const fetchPackedVersion = fakeFetchPackedVersion({
      "0.3.0": { files: {}, pkgVersion: "0.3.0" },
      "0.5.0": { files: {}, pkgVersion: "0.5.0" },
    });

    const result = runSync(
      repoRoot,
      { from: "0.3.0", to: "0.5.0", preset, dryRun: false, allowDirty: true },
      { fetchPackedVersion },
    );

    expect(result.stampedVersion).toBe("0.5.0");
    expect(readConfigJson()).toEqual({ factoryVersion: "0.5.0" });
  });

  describe.skipIf(!hasGit)("dirty working tree", () => {
    function initGitRepo(): void {
      execFileSync("git", ["init"], { cwd: repoRoot, stdio: "ignore" });
      execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: repoRoot });
      execFileSync("git", ["config", "user.name", "Test"], { cwd: repoRoot });
    }

    it("refuses to run on a dirty tree without --allow-dirty", () => {
      initGitRepo();
      seedProvenanceAndManifest();
      writeFileSync(path.join(repoRoot, "untracked.txt"), "dirty");

      expect(() => runSync(repoRoot, { to: "0.5.0", dryRun: false, allowDirty: false })).toThrow(
        /refuses to run on a dirty working tree/,
      );
    });

    it("proceeds on a dirty tree when --allow-dirty is passed", () => {
      initGitRepo();
      seedProvenanceAndManifest();
      writeFileSync(path.join(repoRoot, "untracked.txt"), "dirty");
      mkdirSync(path.join(repoRoot, "tracked"), { recursive: true });

      const fetchPackedVersion = fakeFetchPackedVersion({
        "0.3.0": { files: {}, pkgVersion: "0.3.0" },
        "0.5.0": { files: {}, pkgVersion: "0.5.0" },
      });

      const result = runSync(
        repoRoot,
        { to: "0.5.0", dryRun: false, allowDirty: true },
        { fetchPackedVersion },
      );

      expect(result.exitCode).toBe(0);
    });

    it("proceeds on a clean tree without --allow-dirty", () => {
      initGitRepo();
      seedProvenanceAndManifest();
      execFileSync("git", ["add", "-A"], { cwd: repoRoot });
      execFileSync("git", ["commit", "-m", "seed"], { cwd: repoRoot, stdio: "ignore" });
      mkdirSync(path.join(repoRoot, "tracked"), { recursive: true });

      const fetchPackedVersion = fakeFetchPackedVersion({
        "0.3.0": { files: {}, pkgVersion: "0.3.0" },
        "0.5.0": { files: {}, pkgVersion: "0.5.0" },
      });

      const result = runSync(
        repoRoot,
        { to: "0.5.0", dryRun: false, allowDirty: false },
        { fetchPackedVersion },
      );

      expect(result.exitCode).toBe(0);
    });
  });
});
