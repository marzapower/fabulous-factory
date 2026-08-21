import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  hashFile,
  itemStatus,
  ledgerReport,
  ledgerReportSafe,
  loadFactoryConfig,
  loadManifest,
  loadStage,
  renderStatusLines,
  staleEntries,
  type ManifestItem,
} from "../scripts/factory-ledger";

let rootDir: string;

beforeEach(() => {
  // Never realpath rootDir (opt-23) — macOS `/tmp` is a symlink to `/private/tmp`, and
  // resolving it would break relative-path assertions against the raw mkdtempSync result.
  rootDir = mkdtempSync(path.join(tmpdir(), "factory-ledger-test-"));
});

afterEach(() => {
  rmSync(rootDir, { recursive: true, force: true });
});

function writeFactoryFile(rootDir: string, relPath: string, content: string): void {
  const abs = path.join(rootDir, relPath);
  mkdirSync(path.dirname(abs), { recursive: true });
  writeFileSync(abs, content, "utf8");
}

function writeManifest(rootDir: string, items: ManifestItem[]): void {
  writeFactoryFile(
    rootDir,
    ".factory/manifest.json",
    JSON.stringify({ comment: "test manifest", items }, null, 2),
  );
}

function writeConfig(rootDir: string, config: unknown): void {
  writeFactoryFile(rootDir, ".factory/config.json", JSON.stringify(config, null, 2));
}

function sha256(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

describe("hashFile", () => {
  it("is stable across calls for the same bytes", () => {
    writeFactoryFile(rootDir, "a.txt", "hello world");
    const abs = path.join(rootDir, "a.txt");
    expect(hashFile(abs)).toBe(hashFile(abs));
  });

  it("matches an independently computed sha256 of the raw bytes", () => {
    writeFactoryFile(rootDir, "a.txt", "hello world");
    const abs = path.join(rootDir, "a.txt");
    expect(hashFile(abs)).toBe(sha256("hello world"));
  });

  it("differs when the content differs", () => {
    writeFactoryFile(rootDir, "a.txt", "hello world");
    writeFactoryFile(rootDir, "b.txt", "goodbye world");
    expect(hashFile(path.join(rootDir, "a.txt"))).not.toBe(hashFile(path.join(rootDir, "b.txt")));
  });
});

describe("loadManifest", () => {
  it("throws a clear error when the manifest file is missing", () => {
    expect(() => loadManifest(rootDir)).toThrow(/manifest/i);
  });

  it("throws a clear error on invalid JSON", () => {
    writeFactoryFile(rootDir, ".factory/manifest.json", "{ not json");
    expect(() => loadManifest(rootDir)).toThrow();
  });

  it("throws a clear error on the wrong shape", () => {
    writeFactoryFile(rootDir, ".factory/manifest.json", JSON.stringify({ foo: "bar" }));
    expect(() => loadManifest(rootDir)).toThrow();
  });

  it("parses a well-formed manifest", () => {
    const items: ManifestItem[] = [
      {
        id: "x",
        title: "X",
        why: "why",
        skill: "skill-x",
        blocksProduction: false,
        files: [{ path: "x.txt", hash: "abc" }],
      },
    ];
    writeManifest(rootDir, items);
    expect(loadManifest(rootDir)).toEqual({ comment: "test manifest", items });
  });
});

describe("loadStage / loadFactoryConfig", () => {
  it("falls back to prototype when config.json is missing", () => {
    expect(loadStage(rootDir)).toBe("prototype");
    expect(loadFactoryConfig(rootDir)).toEqual({ stage: "prototype", template: false });
  });

  it("falls back to prototype on invalid JSON", () => {
    writeFactoryFile(rootDir, ".factory/config.json", "{ not json");
    expect(loadStage(rootDir)).toBe("prototype");
  });

  it("falls back to prototype on an unrecognized stage value", () => {
    writeConfig(rootDir, { stage: "staging" });
    expect(loadStage(rootDir)).toBe("prototype");
  });

  it("reads stage: production", () => {
    writeConfig(rootDir, { stage: "production" });
    expect(loadStage(rootDir)).toBe("production");
  });

  it("reads the template flag", () => {
    writeConfig(rootDir, { stage: "prototype", template: true });
    expect(loadFactoryConfig(rootDir)).toEqual({ stage: "prototype", template: true });
  });

  it("defaults template to false when absent", () => {
    writeConfig(rootDir, { stage: "prototype" });
    expect(loadFactoryConfig(rootDir).template).toBe(false);
  });
});

describe("itemStatus — AND-rule classification matrix", () => {
  it("single-file item: present + matching hash → factory-default", () => {
    writeFactoryFile(rootDir, "a.txt", "content");
    const item: ManifestItem = {
      id: "a",
      title: "A",
      why: "why",
      skill: "s",
      blocksProduction: false,
      files: [{ path: "a.txt", hash: sha256("content") }],
    };
    expect(itemStatus(rootDir, item)).toBe("factory-default");
  });

  it("single-file item: present + differing hash → touched", () => {
    writeFactoryFile(rootDir, "a.txt", "edited content");
    const item: ManifestItem = {
      id: "a",
      title: "A",
      why: "why",
      skill: "s",
      blocksProduction: false,
      files: [{ path: "a.txt", hash: sha256("original content") }],
    };
    expect(itemStatus(rootDir, item)).toBe("touched");
  });

  it("single-file item: missing → removed", () => {
    const item: ManifestItem = {
      id: "a",
      title: "A",
      why: "why",
      skill: "s",
      blocksProduction: false,
      files: [{ path: "a.txt", hash: sha256("content") }],
    };
    expect(itemStatus(rootDir, item)).toBe("removed");
  });

  it("single-file item: PENDING hash never matches real bytes → touched, not factory-default", () => {
    writeFactoryFile(rootDir, "a.txt", "content");
    const item: ManifestItem = {
      id: "a",
      title: "A",
      why: "why",
      skill: "s",
      blocksProduction: false,
      files: [{ path: "a.txt", hash: "PENDING" }],
    };
    expect(itemStatus(rootDir, item)).toBe("touched");
  });

  it("multi-file item: one matching + one differing (both present) → factory-default (ANY match wins)", () => {
    writeFactoryFile(rootDir, "a.txt", "unchanged");
    writeFactoryFile(rootDir, "b.txt", "edited");
    const item: ManifestItem = {
      id: "ab",
      title: "AB",
      why: "why",
      skill: "s",
      blocksProduction: false,
      files: [
        { path: "a.txt", hash: sha256("unchanged") },
        { path: "b.txt", hash: sha256("original b") },
      ],
    };
    expect(itemStatus(rootDir, item)).toBe("factory-default");
  });

  it("multi-file item: one differing + one missing (none matching) → touched", () => {
    writeFactoryFile(rootDir, "a.txt", "edited");
    const item: ManifestItem = {
      id: "ab",
      title: "AB",
      why: "why",
      skill: "s",
      blocksProduction: false,
      files: [
        { path: "a.txt", hash: sha256("original a") },
        { path: "b.txt", hash: sha256("original b") },
      ],
    };
    expect(itemStatus(rootDir, item)).toBe("touched");
  });

  it("multi-file item: all present but all differing → touched", () => {
    writeFactoryFile(rootDir, "a.txt", "edited a");
    writeFactoryFile(rootDir, "b.txt", "edited b");
    const item: ManifestItem = {
      id: "ab",
      title: "AB",
      why: "why",
      skill: "s",
      blocksProduction: false,
      files: [
        { path: "a.txt", hash: sha256("original a") },
        { path: "b.txt", hash: sha256("original b") },
      ],
    };
    expect(itemStatus(rootDir, item)).toBe("touched");
  });

  it("multi-file item: all missing → removed", () => {
    const item: ManifestItem = {
      id: "ab",
      title: "AB",
      why: "why",
      skill: "s",
      blocksProduction: false,
      files: [
        { path: "a.txt", hash: sha256("original a") },
        { path: "b.txt", hash: sha256("original b") },
      ],
    };
    expect(itemStatus(rootDir, item)).toBe("removed");
  });

  it("multi-file item: all present + all matching → factory-default", () => {
    writeFactoryFile(rootDir, "a.txt", "original a");
    writeFactoryFile(rootDir, "b.txt", "original b");
    const item: ManifestItem = {
      id: "ab",
      title: "AB",
      why: "why",
      skill: "s",
      blocksProduction: false,
      files: [
        { path: "a.txt", hash: sha256("original a") },
        { path: "b.txt", hash: sha256("original b") },
      ],
    };
    expect(itemStatus(rootDir, item)).toBe("factory-default");
  });
});

describe("ledgerReport / ledgerReportSafe", () => {
  const items: ManifestItem[] = [
    {
      id: "x",
      title: "X",
      why: "why",
      skill: "skill-x",
      blocksProduction: true,
      files: [{ path: "x.txt", hash: "" }],
    },
  ];

  it("builds a full report with per-item status", () => {
    writeFactoryFile(rootDir, "x.txt", "hi");
    writeManifest(rootDir, [{ ...items[0], files: [{ path: "x.txt", hash: sha256("hi") }] }]);
    writeConfig(rootDir, { stage: "production" });

    const report = ledgerReport(rootDir);
    expect(report.stage).toBe("production");
    expect(report.handoffPresent).toBe(false);
    expect(report.items).toHaveLength(1);
    expect(report.items[0].status).toBe("factory-default");
  });

  it("detects handoffPresent from .factory/handoff", () => {
    writeManifest(rootDir, items);
    mkdirSync(path.join(rootDir, ".factory", "handoff"), { recursive: true });
    expect(ledgerReport(rootDir).handoffPresent).toBe(true);
  });

  it("ledgerReport throws when the manifest is missing", () => {
    expect(() => ledgerReport(rootDir)).toThrow();
  });

  it("ledgerReportSafe returns null when the manifest is missing", () => {
    expect(ledgerReportSafe(rootDir)).toBeNull();
  });

  it("ledgerReportSafe returns null on corrupt manifest JSON", () => {
    writeFactoryFile(rootDir, ".factory/manifest.json", "{ this is not json");
    expect(ledgerReportSafe(rootDir)).toBeNull();
  });

  it("ledgerReportSafe returns a report when the manifest is valid", () => {
    writeManifest(rootDir, items);
    expect(ledgerReportSafe(rootDir)).not.toBeNull();
  });
});

describe("staleEntries", () => {
  it("is empty when every file matches its recorded hash", () => {
    writeFactoryFile(rootDir, "x.txt", "hi");
    writeManifest(rootDir, [
      {
        id: "x",
        title: "X",
        why: "why",
        skill: "s",
        blocksProduction: false,
        files: [{ path: "x.txt", hash: sha256("hi") }],
      },
    ]);
    expect(staleEntries(rootDir)).toEqual([]);
  });

  it("lists a file whose hash differs from disk", () => {
    writeFactoryFile(rootDir, "x.txt", "edited");
    writeManifest(rootDir, [
      {
        id: "x",
        title: "X",
        why: "why",
        skill: "s",
        blocksProduction: false,
        files: [{ path: "x.txt", hash: sha256("original") }],
      },
    ]);
    const stale = staleEntries(rootDir);
    expect(stale).toEqual([
      { path: "x.txt", expected: sha256("original"), actual: sha256("edited") },
    ]);
  });

  it("reports actual: null for a missing file", () => {
    writeManifest(rootDir, [
      {
        id: "x",
        title: "X",
        why: "why",
        skill: "s",
        blocksProduction: false,
        files: [{ path: "x.txt", hash: sha256("original") }],
      },
    ]);
    expect(staleEntries(rootDir)).toEqual([
      { path: "x.txt", expected: sha256("original"), actual: null },
    ]);
  });
});

describe("renderStatusLines", () => {
  it("renders the factory-default glyph and skill pointer", () => {
    const lines = renderStatusLines({
      stage: "prototype",
      handoffPresent: false,
      items: [
        {
          id: "x",
          title: "X",
          why: "why",
          skill: "skill-x",
          blocksProduction: false,
          files: [],
          status: "factory-default",
        },
      ],
    });
    expect(lines[0]).toBe("stage: prototype");
    expect(lines[1]).toBe("● x — factory default → skill: skill-x");
  });

  it("renders touched/removed with a plain checkmark", () => {
    const lines = renderStatusLines({
      stage: "prototype",
      handoffPresent: false,
      items: [
        {
          id: "t",
          title: "T",
          why: "why",
          skill: "s",
          blocksProduction: false,
          files: [],
          status: "touched",
        },
        {
          id: "r",
          title: "R",
          why: "why",
          skill: "s",
          blocksProduction: false,
          files: [],
          status: "removed",
        },
      ],
    });
    expect(lines).toContain("✓ t — touched");
    expect(lines).toContain("✓ r — removed");
  });
});
