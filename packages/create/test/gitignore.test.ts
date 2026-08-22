import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { renameGitignoreFiles } from "../src/lib/gitignore";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "gitignore-rename-test-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("renameGitignoreFiles", () => {
  it("renames a root-level 'gitignore' file to '.gitignore'", () => {
    writeFileSync(path.join(dir, "gitignore"), "node_modules\n");
    renameGitignoreFiles(dir);
    expect(existsSync(path.join(dir, ".gitignore"))).toBe(true);
    expect(existsSync(path.join(dir, "gitignore"))).toBe(false);
  });

  it("renames a nested 'gitignore' file", () => {
    mkdirSync(path.join(dir, "apps", "web"), { recursive: true });
    writeFileSync(path.join(dir, "apps", "web", "gitignore"), ".next\n");
    renameGitignoreFiles(dir);
    expect(existsSync(path.join(dir, "apps", "web", ".gitignore"))).toBe(true);
  });

  it("leaves a directory with no 'gitignore' file untouched", () => {
    writeFileSync(path.join(dir, "README.md"), "# hi\n");
    expect(() => renameGitignoreFiles(dir)).not.toThrow();
    expect(existsSync(path.join(dir, "README.md"))).toBe(true);
  });

  it("does not descend into node_modules", () => {
    mkdirSync(path.join(dir, "node_modules", "some-pkg"), { recursive: true });
    writeFileSync(path.join(dir, "node_modules", "some-pkg", "gitignore"), "irrelevant\n");
    renameGitignoreFiles(dir);
    expect(existsSync(path.join(dir, "node_modules", "some-pkg", "gitignore"))).toBe(true);
  });
});
