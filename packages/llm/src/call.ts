/**
 * Shared call accounting (plan K.3.1), extracted from `generate.ts` verbatim-in-behavior.
 * Two consumers — `generate.ts` (single-shot text/object) and `stream.ts`
 * (`streamArray`) — so neither path is allowed to fork the accounting. The runtime order
 * documented in `generate.ts`'s header still holds; this module owns steps 1-4 (resolve →
 * assemble → budget pre-check, via `prepareCall`) and steps 6-8 (usage → cost → span
 * attributes → `llm_calls` write, via `finalizeCall`/`recordCallFailure`). The provider
 * call itself (step 5) and the OTel span's lifecycle (start/end, step 4/8's outer shell)
 * stay owned by each caller, because the two callers use a different `ai` function
 * (`generateText` vs `streamText`) and a different span name / `gen_ai.operation.name`.
 *
 * `resolveLanguageModel` and `recordLlmCall` are imported directly from `./profile` and
 * `./record` (never through a re-export) — `test/generate.test.ts` mocks those two
 * modules BY PATH, and an indirection here would silently stop the mocks from
 * intercepting (plan K.14 R3).
 */
import { APICallError, NoOutputGeneratedError, RetryError, type LanguageModel } from "ai";

import type { Untrusted } from "@factory/core/untrusted";
import { SpanStatusCode, type Span } from "@factory/observability";

import { LlmBudgetExceededError } from "./errors";
import { estimateCostCents } from "./pricing";
import { assemblePrompt } from "./prompt";
import { resolveLanguageModel } from "./profile";
import { recordLlmCall } from "./record";
import type { Quality } from "./routing";

export interface GenerateOptions {
  /** Trusted task instructions, written by the developer. */
  task: string;
  /** Additional content; wrap external/model-adjacent data with untrusted() (core). */
  context?: Array<string | Untrusted<string>>;
  quality?: Quality;
  maxCostCents?: number;
  promptId?: string;
  maxOutputTokens?: number;
  timeoutMs?: number;
  abortSignal?: AbortSignal;
}

export interface GenerateResult<T = string> {
  output: T;
  model: string;
  profile: "local" | "openrouter" | "direct";
  usage: { inputTokens: number | null; outputTokens: number | null };
  costCents: number | null;
  costSource: "reported" | "estimated" | "unknown";
  latencyMs: number;
}

export interface PreparedCall {
  model: LanguageModel;
  modelId: string;
  profile: "local" | "openrouter" | "direct";
  quality: Quality;
  instructions: string | undefined;
  prompt: string;
  enforcedMaxOutputTokens: number | undefined;
}

interface OpenRouterUsageMetadata {
  usage?: { cost?: number };
}

/**
 * Best-effort extraction of OpenRouter's provider-reported USD cost (plan F.2.6/F.10.7 —
 * `providerMetadata.openrouter.usage.cost`, confirmed present in the 3.0.0 typings but
 * loosely typed as `Record<string, JSONObject>` at the `ai`-package level, hence the cast).
 */
export function extractOpenRouterCostUsd(
  providerMetadata: Record<string, unknown> | undefined,
): number | undefined {
  const openrouter = providerMetadata?.openrouter as OpenRouterUsageMetadata | undefined;
  const cost = openrouter?.usage?.cost;
  return typeof cost === "number" ? cost : undefined;
}

/**
 * Maps a `generateText`/`streamText` failure to a stable, machine-readable error code
 * (plan F.4 step 8): the AI SDK's static `.isInstance` checks for the well-known error
 * classes, falling back to the error's own `name` (or a fixed sentinel for non-`Error`
 * throws).
 */
export function detectErrorCode(error: unknown): string {
  if (APICallError.isInstance(error)) return "APICallError";
  if (RetryError.isInstance(error)) return "RetryError";
  if (NoOutputGeneratedError.isInstance(error)) return "NoOutputGeneratedError";
  if (error instanceof Error) return error.name;
  return "UnknownError";
}

/**
 * Steps 1-4 of the documented runtime order: resolve → assemble → budget pre-check.
 * Throws `LlmDisabledError` (via `resolveLanguageModel`) / `LlmBudgetExceededError`
 * before any provider call — neither outcome is ever recorded to `llm_calls`, because no
 * provider was called and nothing happened.
 */
export async function prepareCall(opts: GenerateOptions): Promise<PreparedCall> {
  const quality: Quality = opts.quality ?? "balanced";

  // Step 1 (+ 2, routing folded in): throws LlmDisabledError before any provider import.
  const { model, modelId, profile } = await resolveLanguageModel(quality);

  // Step 3: prompt assembly.
  const { instructions, prompt } = assemblePrompt(opts.task, opts.context);

  // Step 4: budget pre-check (F.2.7). A KNOWN model's estimate over `maxCostCents` refuses
  // the call before the provider is ever touched — no span, no `llm_calls` row. An unknown
  // model (no pricing entry) has no estimate to refuse against, so the call proceeds.
  const outputTokensEstimate = opts.maxOutputTokens ?? 1024;
  // Review fix: when a budget was given, the output-token assumption the budget was
  // checked against MUST also be the enforced generation cap — otherwise a caller with
  // `maxCostCents` but no `maxOutputTokens` gets a pre-check against 1024 tokens while
  // the model is free to emit tens of thousands. Without a budget, the caller's own
  // value (or provider default) passes through untouched.
  const enforcedMaxOutputTokens =
    opts.maxCostCents !== undefined ? outputTokensEstimate : opts.maxOutputTokens;
  if (opts.maxCostCents !== undefined) {
    const totalPromptChars = (instructions?.length ?? 0) + prompt.length;
    const inputTokensEstimate = Math.ceil(totalPromptChars / 4);
    const estimatedCostCents = estimateCostCents(
      modelId,
      inputTokensEstimate,
      outputTokensEstimate,
    );
    if (estimatedCostCents !== null && estimatedCostCents > opts.maxCostCents) {
      throw new LlmBudgetExceededError(estimatedCostCents, opts.maxCostCents);
    }
  }

  return { model, modelId, profile, quality, instructions, prompt, enforcedMaxOutputTokens };
}

/**
 * Step 6-7: usage → cost, span attributes, `llm_calls` write. Returns the envelope the
 * caller resolves its promise with. Does NOT end `span` — the caller owns the span's
 * `start`/`end` lifecycle (step 4/8's outer shell), since only the caller knows whether
 * more provider work follows in the same span.
 */
export async function finalizeCall<T>(args: {
  prepared: PreparedCall;
  span: Span;
  startedAt: number;
  promptId: string | undefined;
  output: T;
  inputTokens: number | null;
  outputTokens: number | null;
  openRouterCostUsd: number | undefined;
}): Promise<GenerateResult<T>> {
  const {
    prepared,
    span,
    startedAt,
    promptId,
    output,
    inputTokens,
    outputTokens,
    openRouterCostUsd,
  } = args;
  const latencyMs = Date.now() - startedAt;

  // Step 6: usage → cost (F.2.6/F.10.7).
  let costCents: number | null;
  let costSource: "reported" | "estimated" | "unknown";
  if (prepared.profile === "local") {
    // Free local inference — pricing.json is never consulted (F.2.6).
    costCents = 0;
    costSource = "estimated";
  } else if (prepared.profile === "openrouter" && openRouterCostUsd !== undefined) {
    costCents = openRouterCostUsd * 100;
    costSource = "reported";
  } else {
    const estimated = estimateCostCents(
      prepared.modelId,
      inputTokens ?? undefined,
      outputTokens ?? undefined,
    );
    costCents = estimated;
    costSource = estimated === null ? "unknown" : "estimated";
  }

  // F.10.11: OTel attributes reject null — omit token/cost attributes when null.
  if (inputTokens !== null) span.setAttribute("gen_ai.usage.input_tokens", inputTokens);
  if (outputTokens !== null) span.setAttribute("gen_ai.usage.output_tokens", outputTokens);
  if (costCents !== null) span.setAttribute("llm.cost_cents", costCents);
  span.setAttribute("llm.cost_source", costSource);
  span.setStatus({ code: SpanStatusCode.OK });

  // Step 7: accounting write (also on failure, see recordCallFailure).
  await recordLlmCall({
    promptId: promptId ?? null,
    profile: prepared.profile,
    model: prepared.modelId,
    quality: prepared.quality,
    inputTokens,
    outputTokens,
    costCents,
    costSource,
    latencyMs,
    ok: true,
    errorCode: null,
  });

  return {
    output,
    model: prepared.modelId,
    profile: prepared.profile,
    usage: { inputTokens, outputTokens },
    costCents,
    costSource,
    latencyMs,
  };
}

/**
 * Step 8 failure path: span status, error code, failed `llm_calls` row. Never wraps the
 * original error — it is only inspected (via `detectErrorCode`) and rethrown unchanged by
 * the caller after this resolves.
 */
export async function recordCallFailure(args: {
  prepared: PreparedCall;
  span: Span;
  startedAt: number;
  promptId: string | undefined;
  error: unknown;
}): Promise<void> {
  const { prepared, span, startedAt, promptId, error } = args;
  const latencyMs = Date.now() - startedAt;
  const errorCode = detectErrorCode(error);

  span.recordException(error instanceof Error ? error : new Error(String(error)));
  span.setAttribute("llm.error_code", errorCode);
  span.setStatus({
    code: SpanStatusCode.ERROR,
    message: error instanceof Error ? error.message : String(error),
  });

  await recordLlmCall({
    promptId: promptId ?? null,
    profile: prepared.profile,
    model: prepared.modelId,
    quality: prepared.quality,
    inputTokens: null,
    outputTokens: null,
    costCents: null,
    costSource: "unknown",
    latencyMs,
    ok: false,
    errorCode,
  });
}
