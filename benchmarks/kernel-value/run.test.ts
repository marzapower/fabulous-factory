/**
 * `run.ts` — unit tests for the pure grep-probe classification logic (`classifyContent`,
 * built on the exported `PROBES`/`TIMEOUT_HINT`). No filesystem, no child_process, no
 * network — the CLI body behind `run.ts`'s `invokedDirectly` gate isn't exercised here.
 */
import { describe, expect, it } from "vitest";

import { classifyContent } from "./run";

describe("classifyContent", () => {
  it("flags a raw fetch( call as fetch-not-safe-fetch", () => {
    const hits = classifyContent("candidate.ts", 'const res = fetch("https://example.com");\n');
    expect(hits.map((h) => h.probeId)).toContain("fetch-not-safe-fetch");
  });

  it("flags direct process.env access as raw-process-env", () => {
    const hits = classifyContent("candidate.ts", "const key = process.env.API_KEY;\n");
    expect(hits.map((h) => h.probeId)).toContain("raw-process-env");
  });

  it("flags a raw exported route handler as raw-route-export", () => {
    const hits = classifyContent("route.ts", "export async function GET(req: Request) {}\n");
    expect(hits.map((h) => h.probeId)).toContain("raw-route-export");
  });

  it("flags a fetch() with no nearby timeout/signal hint as missing-timeout-signal", () => {
    const hits = classifyContent("candidate.ts", 'fetch("https://example.com");\n');
    expect(hits.map((h) => h.probeId)).toContain("missing-timeout-signal");
  });

  it("does not flag missing-timeout-signal when a signal is present within the context window", () => {
    const content = ["fetch(url, {", "  signal: AbortSignal.timeout(5000),", "});", ""].join("\n");
    const hits = classifyContent("candidate.ts", content);
    expect(hits.map((h) => h.probeId)).not.toContain("missing-timeout-signal");
  });

  it("reports 1-based line numbers and the trimmed snippet", () => {
    const content = "const a = 1;\nconst key = process.env.SECRET;\n";
    const hits = classifyContent("candidate.ts", content);
    const hit = hits.find((h) => h.probeId === "raw-process-env");
    expect(hit).toEqual({
      probeId: "raw-process-env",
      file: "candidate.ts",
      line: 2,
      snippet: "const key = process.env.SECRET;",
    });
  });

  it("returns no hits for clean, kernel-shaped content", () => {
    const content = [
      "import { safeFetch } from '@factory/core';",
      "import { readMergedEnv } from '@factory/config';",
      "",
      "export const handler = defineHandler(async () => {",
      "  const env = readMergedEnv();",
      "  return safeFetch(env.SOME_URL, { timeout: 5000 });",
      "});",
      "",
    ].join("\n");
    expect(classifyContent("candidate.ts", content)).toEqual([]);
  });
});
