#!/usr/bin/env -S pnpm exec tsx
// benchmarks/kernel-value/run.ts — harness skeleton for the kernel-value study.
// See ./README.md for the hypothesis, prompt set, protocol, and (important) limitations.
//
// Usage:
//   pnpm exec tsx benchmarks/kernel-value/run.ts --raw candidates/raw --kernel candidates/kernel
//   pnpm exec tsx benchmarks/kernel-value/run.ts --raw <dir> --kernel <dir> --out report.json
//
// Zero new root dependencies. Runs whatever checks are actually available on this
// machine and says so — never crashes because an optional tool (semgrep) is missing,
// never silently claims coverage it doesn't have.

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// ---------------------------------------------------------------------------------------
// Arg parsing — deliberately tiny, no dependency.
// ---------------------------------------------------------------------------------------

export function parseArgs(argv: string[]) {
  const out: { raw?: string; kernel?: string; out?: string } = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--raw") out.raw = argv[++i];
    else if (arg === "--kernel") out.kernel = argv[++i];
    else if (arg === "--out") out.out = argv[++i];
  }
  return out;
}

// ---------------------------------------------------------------------------------------
// File collection
// ---------------------------------------------------------------------------------------

const CODE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);

export function collectFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const results: string[] = [];
  const walk = (current: string) => {
    for (const entry of readdirSync(current)) {
      if (entry === "node_modules" || entry === ".gitkeep" || entry.startsWith(".")) continue;
      const full = path.join(current, entry);
      const stat = statSync(full);
      if (stat.isDirectory()) walk(full);
      else if (CODE_EXTENSIONS.has(path.extname(entry))) results.push(full);
    }
  };
  walk(dir);
  return results;
}

// ---------------------------------------------------------------------------------------
// Grep probes — cheap, mechanical, no AST. See README "Metrics" for what each catches.
// ---------------------------------------------------------------------------------------

export type Probe = {
  id: string;
  description: string;
  pattern: RegExp;
};

export const PROBES: Probe[] = [
  {
    id: "fetch-not-safe-fetch",
    description:
      "fetch(/axios/undici call present without a nearby safeFetch( wrapper — possible unwrapped user-URL fetch (SSRF-shaped).",
    pattern: /\b(?:fetch|axios(?:\.\w+)?|undici)\s*\(/,
  },
  {
    id: "raw-process-env",
    description: "Direct process.env access outside the config registry.",
    pattern: /process\.env\.[A-Z_][A-Z0-9_]*/,
  },
  {
    id: "missing-timeout-signal",
    description:
      "External call present with no visible timeout/AbortSignal/retry on the same or an adjacent line (heuristic — false positives expected).",
    // Matched separately below; needs a two-step check (call present, no signal nearby).
    pattern: /\b(?:fetch|axios(?:\.\w+)?)\s*\(/,
  },
  {
    id: "raw-route-export",
    description:
      "Route handler exported directly (export ... function GET/POST/...) instead of via defineHandler.",
    pattern: /export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE)\s*\(/,
  },
];

export const TIMEOUT_HINT = /(timeout|AbortSignal|AbortController|signal\s*:)/i;

export type ProbeHit = { probeId: string; file: string; line: number; snippet: string };

/**
 * Pure classification core: given already-read file contents (`relativePath` used only
 * for the report, never touches disk itself), returns every probe hit. Exported
 * separately from `runProbes` (which does the actual file reads) so the grep-probe
 * classification logic — the thing worth unit-testing — has no filesystem dependency.
 */
export function classifyContent(relativePath: string, content: string): ProbeHit[] {
  const hits: ProbeHit[] = [];
  const lines = content.split("\n");
  lines.forEach((line, idx) => {
    for (const probe of PROBES) {
      if (!probe.pattern.test(line)) continue;
      if (probe.id === "missing-timeout-signal") {
        // Heuristic: look at this line plus 3 lines of context for a timeout/signal hint.
        const window = lines.slice(idx, idx + 4).join("\n");
        if (TIMEOUT_HINT.test(window)) continue;
      }
      hits.push({
        probeId: probe.id,
        file: relativePath,
        line: idx + 1,
        snippet: line.trim(),
      });
    }
  });
  return hits;
}

export function runProbes(files: string[], repoRoot: string): ProbeHit[] {
  const hits: ProbeHit[] = [];
  for (const file of files) {
    const content = readFileSync(file, "utf8");
    hits.push(...classifyContent(path.relative(repoRoot, file), content));
  }
  return hits;
}

// ---------------------------------------------------------------------------------------
// Factory ESLint rules — run via `pnpm exec eslint` against the given files. Scoped to
// files that exist; degrades to "skipped" (never throws) if eslint itself errors out for
// an environmental reason (e.g. not installed).
// ---------------------------------------------------------------------------------------

export function runEslint(
  files: string[],
  repoRoot: string,
): { ran: boolean; results: unknown[]; note: string } {
  if (files.length === 0) return { ran: false, results: [], note: "no files to lint" };
  try {
    const out = execFileSync(
      "pnpm",
      ["exec", "eslint", "--format", "json", ...files.map((f) => path.relative(repoRoot, f))],
      { cwd: repoRoot, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    );
    return { ran: true, results: JSON.parse(out), note: "ok" };
  } catch (err) {
    // eslint exits non-zero when it finds lint errors — that's a normal, successful run,
    // not a crash. Its JSON report is still on stdout.
    const e = err as { stdout?: string; status?: number; message?: string };
    if (typeof e.stdout === "string" && e.stdout.trim().startsWith("[")) {
      try {
        return { ran: true, results: JSON.parse(e.stdout), note: "ok (lint errors found)" };
      } catch {
        // fall through to skipped
      }
    }
    return {
      ran: false,
      results: [],
      note: `eslint unavailable or failed to run: ${e.message ?? String(err)}`,
    };
  }
}

// Note: the factory/no-raw-handler rule only fires for files under apps/** or
// packages/** (see eslint.config.mjs) — candidate files under benchmarks/ will never
// trigger it, only factory/no-process-env does (it applies to **/*.ts minus a documented
// exception list that candidates aren't on). The raw-route-export grep probe above is
// what actually covers the "did this candidate use a raw handler" signal for both sides.

// ---------------------------------------------------------------------------------------
// Semgrep — optional. Only runs if `semgrep` is on PATH.
// ---------------------------------------------------------------------------------------

export function semgrepAvailable(): boolean {
  try {
    execFileSync("semgrep", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

export function runSemgrep(dir: string): { ran: boolean; results: unknown; note: string } {
  if (!existsSync(dir) || readdirSync(dir).length === 0) {
    return { ran: false, results: null, note: "no candidate files" };
  }
  try {
    const out = execFileSync("semgrep", ["--config", "p/owasp-top-ten", "--json", "--quiet", dir], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { ran: true, results: JSON.parse(out), note: "ok" };
  } catch (err) {
    const e = err as { stdout?: string; message?: string };
    if (typeof e.stdout === "string" && e.stdout.trim().startsWith("{")) {
      try {
        return { ran: true, results: JSON.parse(e.stdout), note: "ok (findings present)" };
      } catch {
        // fall through
      }
    }
    return { ran: false, results: null, note: `semgrep run failed: ${e.message ?? String(err)}` };
  }
}

// ---------------------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------------------

export function analyzeSide(label: string, dir: string, repoRoot: string) {
  const files = collectFiles(dir);
  const probeHits = runProbes(files, repoRoot);
  const eslint = runEslint(files, repoRoot);
  return {
    label,
    dir: path.relative(repoRoot, dir),
    fileCount: files.length,
    probeHits,
    probeHitCounts: PROBES.reduce<Record<string, number>>((acc, p) => {
      acc[p.id] = probeHits.filter((h) => h.probeId === p.id).length;
      return acc;
    }, {}),
    eslint,
  };
}

export function buildReport(rawDir: string, kernelDir: string, repoRoot: string) {
  const hasSemgrep = semgrepAvailable();
  return {
    generatedBy: "benchmarks/kernel-value/run.ts",
    note: "Static/mechanical signals only. See README.md Limitations before drawing conclusions.",
    tooling: {
      semgrep: hasSemgrep ? "available" : "not found on PATH — semgrep checks skipped",
    },
    raw: analyzeSide("raw", rawDir, repoRoot),
    kernel: analyzeSide("kernel", kernelDir, repoRoot),
    semgrep: hasSemgrep
      ? { raw: runSemgrep(rawDir), kernel: runSemgrep(kernelDir) }
      : {
          raw: { ran: false, results: null, note: "semgrep not installed" },
          kernel: { ran: false, results: null, note: "semgrep not installed" },
        },
  };
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  if (!args.raw || !args.kernel) {
    console.error(
      "Usage: pnpm exec tsx benchmarks/kernel-value/run.ts --raw <dir> --kernel <dir> [--out <file>]",
    );
    process.exit(1);
  }

  const repoRoot = path.resolve(import.meta.dirname, "..", "..");
  const rawDir = path.resolve(process.cwd(), args.raw);
  const kernelDir = path.resolve(process.cwd(), args.kernel);

  const report = buildReport(rawDir, kernelDir, repoRoot);
  const json = JSON.stringify(report, null, 2);

  if (args.out) {
    writeFileSync(path.resolve(process.cwd(), args.out), json + "\n", "utf8");
    console.error(`Report written to ${args.out}`);
  } else {
    console.log(json);
  }

  if (report.raw.fileCount === 0 && report.kernel.fileCount === 0) {
    console.error(
      "\nBoth candidates/raw and candidates/kernel are empty — running the actual study is still future work (see README.md). This is a harness dry-run, not a result.",
    );
  }
}

const __filename = fileURLToPath(import.meta.url);
const invokedDirectly =
  process.argv[1] !== undefined && path.resolve(process.argv[1]) === path.resolve(__filename);

if (invokedDirectly) {
  main();
}
