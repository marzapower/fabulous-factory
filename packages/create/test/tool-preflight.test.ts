import { execFileSync } from "node:child_process";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  assertRequiredTools,
  checkTools,
  hasTool,
  MIN_PNPM_MAJOR,
  MissingToolError,
  reportTools,
  type ProbeResult,
  type ToolCheck,
  type ToolName,
  type ToolProbe,
} from "../src/lib/tool-preflight";

vi.mock("node:child_process", () => ({ execFileSync: vi.fn() }));

function fakeProbe(results: Partial<Record<ToolName, ProbeResult>>): ToolProbe {
  return (tool) => results[tool] ?? { status: "ok", version: "1.0.0" };
}

const ALL_OK = fakeProbe({
  pnpm: { status: "ok", version: "10.11.0" },
  git: { status: "ok", version: "git version 2.43.0" },
  docker: { status: "ok", version: "Docker Compose version v2.24.5" },
});

describe("checkTools", () => {
  it("checks pnpm, git, docker in that order", () => {
    const checks = checkTools(ALL_OK);
    expect(checks.map((check) => check.tool)).toEqual(["pnpm", "git", "docker"]);
  });

  it("marks only pnpm as required", () => {
    const checks = checkTools(ALL_OK);
    expect(checks.find((check) => check.tool === "pnpm")?.required).toBe(true);
    expect(checks.find((check) => check.tool === "git")?.required).toBe(false);
    expect(checks.find((check) => check.tool === "docker")?.required).toBe(false);
  });

  it("carries each probe's result through untouched", () => {
    const checks = checkTools(ALL_OK);
    expect(checks.find((check) => check.tool === "git")?.result).toEqual({
      status: "ok",
      version: "git version 2.43.0",
    });
  });

  it("adds no warning for a pnpm version at or above MIN_PNPM_MAJOR", () => {
    const checks = checkTools(
      fakeProbe({ pnpm: { status: "ok", version: `${MIN_PNPM_MAJOR}.0.0` } }),
    );
    expect(checks.find((check) => check.tool === "pnpm")?.warning).toBeUndefined();
  });

  it("warns when pnpm is below MIN_PNPM_MAJOR", () => {
    const checks = checkTools(fakeProbe({ pnpm: { status: "ok", version: "8.15.4" } }));
    const pnpmCheck = checks.find((check) => check.tool === "pnpm");
    expect(pnpmCheck?.warning).toMatch(new RegExp(`>= ${MIN_PNPM_MAJOR}`));
  });

  it("adds no pnpm-version warning when pnpm itself is missing or errored", () => {
    const missing = checkTools(fakeProbe({ pnpm: { status: "missing" } }));
    expect(missing.find((check) => check.tool === "pnpm")?.warning).toBeUndefined();

    const errored = checkTools(fakeProbe({ pnpm: { status: "error", detail: "boom" } }));
    expect(errored.find((check) => check.tool === "pnpm")?.warning).toBeUndefined();
  });

  it("never adds a warning to git or docker", () => {
    const checks = checkTools(
      fakeProbe({
        git: { status: "ok", version: "git version 1.0.0" },
        docker: { status: "ok", version: "Docker Compose version v1.0.0" },
      }),
    );
    expect(checks.find((check) => check.tool === "git")?.warning).toBeUndefined();
    expect(checks.find((check) => check.tool === "docker")?.warning).toBeUndefined();
  });
});

describe("assertRequiredTools", () => {
  it("does not throw when every required tool is ok, regardless of optional tools", () => {
    const checks = checkTools(
      fakeProbe({
        pnpm: { status: "ok", version: "10.11.0" },
        git: { status: "missing" },
        docker: { status: "error", detail: "daemon not running" },
      }),
    );
    expect(() => assertRequiredTools(checks)).not.toThrow();
  });

  it("throws MissingToolError with an install hint when pnpm is missing", () => {
    const checks = checkTools(fakeProbe({ pnpm: { status: "missing" } }));
    expect(() => assertRequiredTools(checks)).toThrow(MissingToolError);
    try {
      assertRequiredTools(checks);
      throw new Error("expected assertRequiredTools to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(MissingToolError);
      expect((error as MissingToolError).tool).toBe("pnpm");
      expect((error as MissingToolError).message).toContain("corepack enable pnpm");
      expect((error as MissingToolError).message).toContain("npm install -g pnpm");
    }
  });

  it("throws a distinct message when pnpm is on PATH but errors", () => {
    const checks = checkTools(
      fakeProbe({ pnpm: { status: "error", detail: "permission denied" } }),
    );
    expect(() => assertRequiredTools(checks)).toThrow(/pnpm --version.*failed.*permission denied/s);
  });

  it("never throws for a missing or errored optional tool", () => {
    const gitMissing = checkTools(fakeProbe({ git: { status: "missing" } }));
    expect(() => assertRequiredTools(gitMissing)).not.toThrow();

    const dockerError = checkTools(fakeProbe({ docker: { status: "error", detail: "nope" } }));
    expect(() => assertRequiredTools(dockerError)).not.toThrow();
  });
});

describe("hasTool", () => {
  it("is true only for a tool whose check status is ok", () => {
    const checks = checkTools(
      fakeProbe({
        git: { status: "ok", version: "2.50.1" },
        docker: { status: "missing" },
      }),
    );
    expect(hasTool(checks, "git")).toBe(true);
    expect(hasTool(checks, "docker")).toBe(false);
  });
});

describe("defaultProbe (checkTools with no probe arg — the real execFileSync-based probe)", () => {
  afterEach(() => {
    vi.mocked(execFileSync).mockReset();
  });

  it("strips version-command boilerplate so the report is just the number", () => {
    vi.mocked(execFileSync).mockImplementation((tool) => {
      if (tool === "pnpm") return "11.22.0\n";
      if (tool === "git") return "git version 2.50.1\n";
      if (tool === "docker") return "Docker Compose version v2.24.5\n";
      throw new Error(`unexpected tool: ${String(tool)}`);
    });

    const checks = checkTools();
    expect(checks.find((check) => check.tool === "pnpm")?.result).toEqual({
      status: "ok",
      version: "11.22.0",
    });
    expect(checks.find((check) => check.tool === "git")?.result).toEqual({
      status: "ok",
      version: "2.50.1",
    });
    expect(checks.find((check) => check.tool === "docker")?.result).toEqual({
      status: "ok",
      version: "2.24.5",
    });
  });

  it("reports an error, never an empty version string, when stdout is blank", () => {
    vi.mocked(execFileSync).mockReturnValue("\n");
    const checks = checkTools();
    expect(checks.find((check) => check.tool === "pnpm")?.result).toEqual({
      status: "error",
      detail: "no version output",
    });
  });
});

describe("reportTools", () => {
  let successSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    const clack = await import("@clack/prompts");
    successSpy = vi.spyOn(clack.log, "success").mockImplementation(() => undefined);
    warnSpy = vi.spyOn(clack.log, "warn").mockImplementation(() => undefined);
    errorSpy = vi.spyOn(clack.log, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    successSpy.mockRestore();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("logs one success line per ok tool with no warning", () => {
    reportTools(checkTools(ALL_OK));
    expect(successSpy).toHaveBeenCalledTimes(3);
    expect(warnSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("logs a warning (not an error) for a missing optional tool", () => {
    reportTools(checkTools(fakeProbe({ git: { status: "missing" } })));
    expect(errorSpy).not.toHaveBeenCalled();
    const [message] = warnSpy.mock.calls.find(([msg]: [string]) => msg.startsWith("git")) as [
      string,
    ];
    expect(message).toContain("not found");
    expect(message).toContain("optional");
  });

  it("logs an error for a missing required tool", () => {
    reportTools(checkTools(fakeProbe({ pnpm: { status: "missing" } })));
    const [message] = errorSpy.mock.calls[0] as [string];
    expect(message).toContain("pnpm");
    expect(message).toContain("not found");
  });

  it("logs a warning with the pnpm-version hint when pnpm is ok but old", () => {
    const checks: ToolCheck[] = [
      { tool: "pnpm", required: true, result: { status: "ok", version: "8.0.0" }, warning: "old" },
    ];
    reportTools(checks);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("pnpm 8.0.0 — old"));
  });
});
