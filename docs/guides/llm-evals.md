# LLM evals

No eval harness ships in this template — that was explicitly descoped (spec-tracked
debt) in favor of this guide, which documents the recommended pattern instead. This is
that guide.

## What `@factory/llm` gives you

- **`generate()`** (`packages/llm/src/generate.ts`) — the entry point for a single-shot
  LLM call. It resolves a provider from the active profile, assembles a
  trusted-instructions + untrusted-context prompt, optionally validates output against a
  zod `schema`, and returns a typed envelope: `output`, `model`, `profile`, `usage`,
  `costCents`, `costSource`, `latencyMs`.
- **`streamArray()`** (`packages/llm/src/stream.ts`) — the streaming counterpart, for
  calls that produce a list of typed elements (e.g. Untangle's task extraction) and want
  each element handed to the caller as it arrives rather than after the whole call
  completes. Shares the same routing, budget, cost, and OTel accounting as `generate()`
  — extracted once, in `call.ts`, so neither path forks the other's behavior.
- **Profile routing** (`packages/llm/src/profile.ts`, `routing.ts`, `models.json`) — one
  of `local` (Ollama-compatible), `openrouter`, `direct` (Anthropic or OpenAI), or
  `disabled`, auto-detected from whichever credentials are present (or forced via
  `LLM_PROFILE`). Each profile routes three quality tiers — `cheap` / `balanced` /
  `high` — to a concrete model id in `models.json`, overridable per tier via
  `LLM_MODEL_CHEAP`/`LLM_MODEL_BALANCED`/`LLM_MODEL_HIGH`.
- **Cost accounting** (`pricing.json`, `packages/llm/src/pricing.ts`) — usage → cost in
  cents, `reported` (OpenRouter's own metered cost) when available, `estimated` from
  `pricing.json` otherwise, `0`/free for the local profile, `unknown` for a model absent
  from `pricing.json`.
- **Budget caps** — pass `maxCostCents` to `generate()` and a known model whose estimated
  cost exceeds it throws `LlmBudgetExceededError` _before_ any provider call (no cost, no
  `llm_calls` row). `generate()` throws `LlmDisabledError` when the `llm` capability is
  disabled — before any vendor SDK is even imported.

## The recommended pattern: a golden-suite script, kept out of `pnpm check`

Real model calls are slow, cost money (even against a free local model, they're slow and
non-deterministic), and can flake on provider-side variance — none of which belongs in
`pnpm check`, which must stay fast, free, and deterministic on every machine including
CI. So:

1. **Run it against the `local` profile.** Set `LLM_PROFILE=local` and
   `LLM_LOCAL_BASE_URL=http://127.0.0.1:11434/v1` (or the Docker `llm` compose profile's
   `http://ollama:11434/v1` — see `deploy-docker.md`) and pull a model with
   `ollama pull <model>`. No API key, no per-run cost.
2. **Write it as a vitest suite that calls `generate()` for real** — not mocked, unlike
   `packages/llm/test/generate.test.ts` (which mocks `resolveLanguageModel` to unit-test
   `generate()`'s own logic in isolation). An eval suite exercises the real provider path
   end to end: real prompt in, real model out.
3. **Graders are plain assertions**, not a scoring framework: substring/regex checks,
   JSON-shape checks when you pass a zod `schema` to `generate()`, or a second `generate()`
   call acting as an LLM-judge for fuzzier cases. Keep them boring and legible.
4. **Put it in its own script**, e.g. `packages/llm/scripts/evals.ts`, run with
   `tsx packages/llm/scripts/evals.ts` or its own `pnpm --filter @factory/llm evals`
   command — deliberately outside `vitest run`/`pnpm test`/`pnpm check`, and outside CI's
   default jobs, so a flaky or unreachable Ollama never blocks a merge.

## Sketch

```ts
// packages/llm/scripts/evals.ts (adopter-authored — not shipped)
import { generate } from "../src/generate";

const cases = [
  {
    name: "summarizes a page diff without hallucinating a URL",
    task: "Summarize what changed between these two page versions in one sentence.",
    context: [/* old/new content, or untrusted() page text */],
    check: (output: string) => output.length < 280 && !/https?:\/\//.test(output),
  },
];

let failures = 0;
for (const c of cases) {
  const { output } = await generate({ task: c.task, context: c.context, quality: "cheap" });
  const ok = c.check(output);
  console.log(`${ok ? "PASS" : "FAIL"} — ${c.name}`);
  if (!ok) failures++;
}
process.exit(failures > 0 ? 1 : 0);
```

Point it at `local` for a free CI-optional run, or at `openrouter`/`direct` with real
credentials for a periodic (nightly, pre-release) check against your actual production
profile — `generate()`'s cost accounting means you always know what that run cost.

## What this guide is not

It doesn't ship a grader library, a fixtures format, or a CI job — those are product
decisions the demo (Untangle, the brain-dump→tasks workspace) doesn't need and a
template shouldn't force on you. Copy the sketch above, adapt the cases to what your
app's prompts actually do, and keep it out of `pnpm check`.
