import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  isValidName,
  parseCliArgs,
  renderTemplate,
  resolveAppDir,
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

/** Creates `apps/<name>` (and its `app/` dir, so page-collision checks have somewhere
 * to look) under `rootDir` for each name given. */
function makeApps(root: string, ...names: string[]): void {
  for (const name of names) {
    mkdirSync(path.join(root, "apps", name, "app"), { recursive: true });
  }
}

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

describe("parseCliArgs", () => {
  it("parses positional args with no --app flag", () => {
    const result = parseCliArgs(["handler", "ping"]);
    expect(result).toEqual({
      positional: ["handler", "ping"],
      appName: undefined,
      appMissingValue: false,
    });
  });

  it("pulls --app <name> out of the tail, leaving positional args in order", () => {
    const result = parseCliArgs(["handler", "ping", "--app", "service"]);
    expect(result).toEqual({
      positional: ["handler", "ping"],
      appName: "service",
      appMissingValue: false,
    });
  });

  it("flags --app given as the last argv element instead of silently dropping it", () => {
    const result = parseCliArgs(["handler", "ping", "--app"]);
    expect(result.appMissingValue).toBe(true);
    expect(result.appName).toBeUndefined();
    expect(result.positional).toEqual(["handler", "ping"]);
  });
});

describe("resolveAppDir", () => {
  it("detects the single app under apps/ with no --app flag needed", () => {
    makeApps(rootDir, "demo");
    const result = resolveAppDir(rootDir);
    expect(result.ok).toBe(true);
    expect(result.appDir).toBe("apps/demo");
  });

  it("selects the named app when several exist and --app is given", () => {
    makeApps(rootDir, "demo", "service");
    const result = resolveAppDir(rootDir, "service");
    expect(result.ok).toBe(true);
    expect(result.appDir).toBe("apps/service");
  });

  it("errors, naming the candidates, when several apps exist and --app is omitted", () => {
    makeApps(rootDir, "demo", "service");
    const result = resolveAppDir(rootDir);
    expect(result.ok).toBe(false);
    expect(result.message).toContain("demo");
    expect(result.message).toContain("service");
    expect(result.message).toContain("--app");
  });

  it("errors when --app names an app that doesn't exist", () => {
    makeApps(rootDir, "demo");
    const result = resolveAppDir(rootDir, "nope");
    expect(result.ok).toBe(false);
    expect(result.message).toContain("nope");
    expect(result.message).toContain("demo");
  });

  it("errors when there is no apps/ directory at all", () => {
    const result = resolveAppDir(rootDir);
    expect(result.ok).toBe(false);
    expect(result.message).toBeDefined();
  });
});

describe("targetPath", () => {
  it("maps handler to <appDir>/app/api/<name>/route.ts", () => {
    expect(targetPath("handler", "ping", "apps/demo")).toBe("apps/demo/app/api/ping/route.ts");
  });

  it("maps page to <appDir>/app/[locale]/<name>/page.tsx", () => {
    expect(targetPath("page", "about", "apps/demo")).toBe("apps/demo/app/[locale]/about/page.tsx");
  });

  it("maps job to packages/jobs/src/functions/<name>.ts regardless of appDir", () => {
    expect(targetPath("job", "sample-sync", "")).toBe("packages/jobs/src/functions/sample-sync.ts");
  });
});

describe("renderTemplate", () => {
  it("handler template is a direct defineHandler(...) call (factory/no-raw-handler)", () => {
    const output = renderTemplate("handler", "ping");
    expect(output).toContain('import { defineHandler } from "@factory/core";');
    expect(output).toContain("export const GET = defineHandler({");
  });

  it("page template default-exports an async <PascalName>Page", () => {
    const output = renderTemplate("page", "sample-sync");
    expect(output).toContain("export default async function SampleSyncPage(");
  });

  it("page template emits the setRequestLocale + getTranslations skeleton (i18n plan §2.6)", () => {
    const output = renderTemplate("page", "sample-sync");
    expect(output).toContain(
      'import { getTranslations, setRequestLocale } from "@factory/i18n/server";',
    );
    expect(output).toContain("params: Promise<{ locale: string }>");
    expect(output).toContain("setRequestLocale(locale)");
    expect(output).toContain('const t = await getTranslations("app");');
    expect(output).toContain('t("sampleSync")');
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

  it("single-app detection: writes a handler scaffold with no --app needed", () => {
    makeApps(rootDir, "demo");
    const result = writeScaffold(rootDir, "handler", "ping");
    expect(result.ok).toBe(true);
    expect(result.messages).toContain("Created apps/demo/app/api/ping/route.ts");

    const written = readFileSync(path.join(rootDir, "apps/demo/app/api/ping/route.ts"), "utf8");
    expect(written).toBe(renderTemplate("handler", "ping"));
  });

  it("single-app detection: writes a page scaffold and reports the created path", () => {
    makeApps(rootDir, "demo");
    const result = writeScaffold(rootDir, "page", "about");
    expect(result.ok).toBe(true);
    expect(result.messages).toContain("Created apps/demo/app/[locale]/about/page.tsx");
  });

  it("multi-app + --app: writes a handler scaffold into the named app", () => {
    makeApps(rootDir, "demo", "service");
    const result = writeScaffold(rootDir, "handler", "ping", "service");
    expect(result.ok).toBe(true);
    expect(result.messages).toContain("Created apps/service/app/api/ping/route.ts");
  });

  it("multi-app + --app: writes a page scaffold into the named app", () => {
    makeApps(rootDir, "demo", "service");
    const result = writeScaffold(rootDir, "page", "about", "demo");
    expect(result.ok).toBe(true);
    expect(result.messages).toContain("Created apps/demo/app/[locale]/about/page.tsx");
  });

  it("multi-app without --app: errors instead of guessing, for a handler", () => {
    makeApps(rootDir, "demo", "service");
    const result = writeScaffold(rootDir, "handler", "ping");
    expect(result.ok).toBe(false);
    expect(result.messages.join("\n")).toContain("--app");
  });

  it("multi-app without --app: errors instead of guessing, for a page", () => {
    makeApps(rootDir, "demo", "service");
    const result = writeScaffold(rootDir, "page", "about");
    expect(result.ok).toBe(false);
    expect(result.messages.join("\n")).toContain("--app");
  });

  it("job scaffolds ignore app detection entirely, even with multiple apps present", () => {
    makeApps(rootDir, "demo", "service");
    const result = writeScaffold(rootDir, "job", "sample-sync");
    expect(result.ok).toBe(true);
    expect(result.messages).toContain("Created packages/jobs/src/functions/sample-sync.ts");
  });

  it("writes a job scaffold and reports the created path", () => {
    const result = writeScaffold(rootDir, "job", "sample-sync");
    expect(result.ok).toBe(true);
    expect(result.messages).toContain("Created packages/jobs/src/functions/sample-sync.ts");
  });

  it("refuses to overwrite an existing handler target", () => {
    makeApps(rootDir, "demo");
    expect(writeScaffold(rootDir, "handler", "ping").ok).toBe(true);
    const second = writeScaffold(rootDir, "handler", "ping");
    expect(second.ok).toBe(false);
    expect(second.messages.join("\n")).toContain("apps/demo/app/api/ping/route.ts already exists");
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
    makeApps(rootDir, "demo");
    expect(writeScaffold(rootDir, "page", "about").ok).toBe(true);
    const second = writeScaffold(rootDir, "page", "about");
    expect(second.ok).toBe(false);
    expect(second.messages.join("\n")).toContain(
      "apps/demo/app/[locale]/about/page.tsx already exists",
    );
  });

  it("refuses a page colliding with a route-group page of the same name (§J.12.9)", () => {
    // Fixture mirrors the real (auth)/login shape.
    makeApps(rootDir, "demo");
    const groupDir = path.join(rootDir, "apps/demo/app/[locale]/(auth)/login");
    mkdirSync(groupDir, { recursive: true });
    writeFileSync(path.join(groupDir, "page.tsx"), "export default function LoginPage() {}\n");

    const result = writeScaffold(rootDir, "page", "login");
    expect(result.ok).toBe(false);
    expect(result.messages.join("\n")).toContain("apps/demo/app/[locale]/(auth)/login/page.tsx");
  });

  it("does not flag a route-group collision for an unrelated name", () => {
    makeApps(rootDir, "demo");
    const groupDir = path.join(rootDir, "apps/demo/app/[locale]/(auth)/login");
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
    makeApps(rootDir, "demo");
    const handlerResult = writeScaffold(rootDir, "handler", "ping");
    expect(handlerResult.messages).toHaveLength(1);

    const pageResult = writeScaffold(rootDir, "page", "about");
    expect(pageResult.messages).toHaveLength(1);
  });
});
