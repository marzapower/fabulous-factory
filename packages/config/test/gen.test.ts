import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  isValidName,
  renderTemplate,
  targetPath,
  toCamelCase,
  toPascalCase,
  writeScaffold,
} from "../scripts/gen";

let rootDir: string;

beforeEach(() => {
  // Never realpath rootDir (opt-23) — macOS `/tmp` is a symlink to `/private/tmp`, and
  // resolving it would break relative-path assertions against the raw mkdtempSync
  // result. Threaded verbatim, exactly as gen.ts itself does.
  rootDir = mkdtempSync(path.join(tmpdir(), "gen-test-"));
});

afterEach(() => {
  rmSync(rootDir, { recursive: true, force: true });
});

describe("isValidName", () => {
  it("accepts single and multi-segment kebab-case names", () => {
    expect(isValidName("ping")).toBe(true);
    expect(isValidName("sample-sync")).toBe(true);
    expect(isValidName("a1-b2")).toBe(true);
  });

  it("rejects path traversal", () => {
    expect(isValidName("../x")).toBe(false);
  });

  it("rejects an uppercase leading character", () => {
    expect(isValidName("A")).toBe(false);
  });

  it("rejects a slash-separated name", () => {
    expect(isValidName("a/b")).toBe(false);
  });

  it("rejects the empty string", () => {
    expect(isValidName("")).toBe(false);
  });

  it("rejects a trailing hyphen (dead group in the old regex)", () => {
    expect(isValidName("foo-")).toBe(false);
  });

  it("rejects a doubled hyphen (dead group in the old regex)", () => {
    expect(isValidName("foo--bar")).toBe(false);
  });
});

describe("toCamelCase / toPascalCase", () => {
  it("derives camelCase from a multi-segment kebab-case name", () => {
    expect(toCamelCase("sample-sync")).toBe("sampleSync");
  });

  it("derives PascalCase from a multi-segment kebab-case name", () => {
    expect(toPascalCase("sample-sync")).toBe("SampleSync");
  });

  it("derives camelCase/PascalCase from a single-segment name", () => {
    expect(toCamelCase("ping")).toBe("ping");
    expect(toPascalCase("ping")).toBe("Ping");
  });
});

describe("targetPath", () => {
  it("maps handler to apps/web/app/api/<name>/route.ts", () => {
    expect(targetPath("handler", "ping")).toBe("apps/web/app/api/ping/route.ts");
  });

  it("maps page to apps/web/app/<name>/page.tsx", () => {
    expect(targetPath("page", "about")).toBe("apps/web/app/about/page.tsx");
  });

  it("maps job to packages/jobs/src/functions/<name>.ts", () => {
    expect(targetPath("job", "sample-sync")).toBe("packages/jobs/src/functions/sample-sync.ts");
  });
});

describe("renderTemplate", () => {
  it("handler template is a direct defineHandler(...) call (factory/no-raw-handler)", () => {
    const output = renderTemplate("handler", "ping");
    expect(output).toContain('import { defineHandler } from "@factory/core";');
    expect(output).toContain("export const GET = defineHandler({");
  });

  it("page template default-exports <PascalName>Page", () => {
    const output = renderTemplate("page", "sample-sync");
    expect(output).toContain("export default function SampleSyncPage()");
  });

  it("job template is a direct inngest.createFunction(...) call with derived identifiers", () => {
    const output = renderTemplate("job", "sample-sync");
    expect(output).toContain('import { inngest } from "../client";');
    expect(output).toContain('const sampleSyncEvent = "app/sample-sync.requested" as const;');
    expect(output).toContain("export const sampleSync = inngest.createFunction(");
    expect(output).toContain('{ id: "sample-sync", triggers: [{ event: sampleSyncEvent }] }');
  });

  it("is deterministic across calls", () => {
    expect(renderTemplate("job", "sample-sync")).toBe(renderTemplate("job", "sample-sync"));
  });
});

describe("writeScaffold", () => {
  it("rejects an invalid name without touching the filesystem", () => {
    const result = writeScaffold(rootDir, "handler", "Foo");
    expect(result.ok).toBe(false);
    expect(result.messages.join("\n")).toContain("Invalid name");
  });

  it("writes a handler scaffold and reports the created path", () => {
    const result = writeScaffold(rootDir, "handler", "ping");
    expect(result.ok).toBe(true);
    expect(result.messages).toContain("Created apps/web/app/api/ping/route.ts");

    const written = readFileSync(path.join(rootDir, "apps/web/app/api/ping/route.ts"), "utf8");
    expect(written).toBe(renderTemplate("handler", "ping"));
  });

  it("writes a page scaffold and reports the created path", () => {
    const result = writeScaffold(rootDir, "page", "about");
    expect(result.ok).toBe(true);
    expect(result.messages).toContain("Created apps/web/app/about/page.tsx");
  });

  it("writes a job scaffold and reports the created path", () => {
    const result = writeScaffold(rootDir, "job", "sample-sync");
    expect(result.ok).toBe(true);
    expect(result.messages).toContain("Created packages/jobs/src/functions/sample-sync.ts");
  });

  it("refuses to overwrite an existing handler target", () => {
    expect(writeScaffold(rootDir, "handler", "ping").ok).toBe(true);
    const second = writeScaffold(rootDir, "handler", "ping");
    expect(second.ok).toBe(false);
    expect(second.messages.join("\n")).toContain("apps/web/app/api/ping/route.ts already exists");
  });

  it("refuses to overwrite an existing job target", () => {
    expect(writeScaffold(rootDir, "job", "sample-sync").ok).toBe(true);
    const second = writeScaffold(rootDir, "job", "sample-sync");
    expect(second.ok).toBe(false);
    expect(second.messages.join("\n")).toContain(
      "packages/jobs/src/functions/sample-sync.ts already exists",
    );
  });

  it("refuses to overwrite an existing plain page target", () => {
    expect(writeScaffold(rootDir, "page", "about").ok).toBe(true);
    const second = writeScaffold(rootDir, "page", "about");
    expect(second.ok).toBe(false);
    expect(second.messages.join("\n")).toContain("apps/web/app/about/page.tsx already exists");
  });

  it("refuses a page colliding with a route-group page of the same name (§J.12.9)", () => {
    // Fixture mirrors the real (auth)/login shape.
    const groupDir = path.join(rootDir, "apps/web/app/(auth)/login");
    mkdirSync(groupDir, { recursive: true });
    writeFileSync(path.join(groupDir, "page.tsx"), "export default function LoginPage() {}\n");

    const result = writeScaffold(rootDir, "page", "login");
    expect(result.ok).toBe(false);
    expect(result.messages.join("\n")).toContain("apps/web/app/(auth)/login/page.tsx");
  });

  it("does not flag a route-group collision for an unrelated name", () => {
    const groupDir = path.join(rootDir, "apps/web/app/(auth)/login");
    mkdirSync(groupDir, { recursive: true });
    writeFileSync(path.join(groupDir, "page.tsx"), "export default function LoginPage() {}\n");

    const result = writeScaffold(rootDir, "page", "about");
    expect(result.ok).toBe(true);
  });

  it("prints both registration edits for a generated job (§J.12.10)", () => {
    const result = writeScaffold(rootDir, "job", "sample-sync");
    const joined = result.messages.join("\n");
    expect(joined).toContain('import { sampleSync } from "./sample-sync";');
    expect(joined).toContain("sampleSync");
    expect(joined.toLowerCase()).toContain("functions array");
    // §J.12.10 review fix: the identifier is printed bare, not quoted as a string literal.
    expect(joined).not.toContain('"sampleSync"');
  });

  it("does not print registration instructions for handler/page scaffolds", () => {
    const handlerResult = writeScaffold(rootDir, "handler", "ping");
    expect(handlerResult.messages).toHaveLength(1);

    const pageResult = writeScaffold(rootDir, "page", "about");
    expect(pageResult.messages).toHaveLength(1);
  });
});
