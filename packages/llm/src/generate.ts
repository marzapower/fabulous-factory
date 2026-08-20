/**
 * `generate()` — the package's headline API (plan F.4). Runtime order:
 *   1. `resolveLanguageModel` — throws `LlmDisabledError` before any provider import
 *      when `capabilities.llm === 'disabled'` (routing happens inside this step too).
 *   2. `assemblePrompt` — trusted `task` + fenced `Untrusted` context.
 *   3. Budget pre-check (F.2.7) — may throw `LlmBudgetExceededError`. This outcome is
 *      NEVER recorded to `llm_calls`: no provider was called, nothing happened.
 *   4. OTel span (`tracer.startActiveSpan("llm.generate", ...)`) wraps everything from
 *      here on — the actual `generateText` call, cost accounting, and the `llm_calls`
 *      write, on both the success and failure paths.
 *   5. `generateText` (static `ai` import — only the provider SDKs are dynamic).
 *   6. Usage → cost (F.2.6/F.10.7).
 *   7. `recordLlmCall` — on success AND on failure (fail-open itself; see record.ts).
 *   8. Return the envelope (success) or rethrow the original error (failure).
 */
import { APICallError, generateText, NoOutputGeneratedError, Output, RetryError } from "ai";
import type { z } from "zod";

import type { Untrusted } from "@factory/core/untrusted";
import { SpanStatusCode, tracer } from "@factory/observability";

import { LlmBudgetExceededError } from "./errors";
import { estimateCostCents } from "./pricing";
import { assemblePrompt } from "./prompt";
import { resolveLanguageModel } from "./profile";
import type { Quality } from "./routing";
import { recordLlmCall } from "./record";

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

interface OpenRouterUsageMetadata {
  usage?: { cost?: number };
}

/**
 * Best-effort extraction of OpenRouter's provider-reported USD cost (plan F.2.6/F.10.7 —
 * `providerMetadata.openrouter.usage.cost`, confirmed present in the 3.0.0 typings but
 * loosely typed as `Record<string, JSONObject>` at the `ai`-package level, hence the cast).
 */
function extractOpenRouterCostUsd(
  providerMetadata: Record<string, unknown> | undefined,
): number | undefined {
  const openrouter = providerMetadata?.openrouter as OpenRouterUsageMetadata | undefined;
  const cost = openrouter?.usage?.cost;
  return typeof cost === "number" ? cost : undefined;
}

/**
 * Maps a `generateText` failure to a stable, machine-readable error code (plan F.4 step
 * 8): the AI SDK's static `.isInstance` checks for the well-known error classes, falling
 * back to the error's own `name` (or a fixed sentinel for non-`Error` throws).
 */
function detectErrorCode(error: unknown): string {
  if (APICallError.isInstance(error)) return "APICallError";
  if (RetryError.isInstance(error)) return "RetryError";
  if (NoOutputGeneratedError.isInstance(error)) return "NoOutputGeneratedError";
  if (error instanceof Error) return error.name;
  return "UnknownError";
}

// Schema overload declared FIRST (F.10.4 — excess-property checks don't apply to
// non-literal args, so schema-first binding keeps `GenerateResult<z.infer<S>>` inference
// for variable-passed options).
export function generate<S extends z.ZodType>(
  opts: GenerateOptions & { schema: S },
): Promise<GenerateResult<z.infer<S>>>;
export function generate(opts: GenerateOptions): Promise<GenerateResult<string>>;
export async function generate(
  opts: GenerateOptions & { schema?: z.ZodType },
): Promise<GenerateResult<unknown>> {
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

  const schema = opts.schema;

  return tracer.startActiveSpan("llm.generate", async (span) => {
    const startedAt = Date.now();

    span.setAttribute("gen_ai.operation.name", "generate_text");
    span.setAttribute("gen_ai.request.model", modelId);
    span.setAttribute("llm.profile", profile);
    span.setAttribute("llm.quality", quality);
    if (opts.promptId !== undefined) {
      span.setAttribute("llm.prompt_id", opts.promptId);
    }

    try {
      let output: unknown;
      let inputTokens: number | null;
      let outputTokens: number | null;
      let openRouterCostUsd: number | undefined;

      const callOptions = {
        model,
        instructions,
        prompt,
        maxRetries: 2,
        timeout: opts.timeoutMs ?? 60_000,
        abortSignal: opts.abortSignal,
        maxOutputTokens: enforcedMaxOutputTokens,
      };

      if (schema) {
        const result = await generateText({ ...callOptions, output: Output.object({ schema }) });
        output = result.output;
        inputTokens = result.usage.inputTokens ?? null;
        outputTokens = result.usage.outputTokens ?? null;
        openRouterCostUsd = extractOpenRouterCostUsd(result.providerMetadata);
      } else {
        const result = await generateText(callOptions);
        output = result.text;
        inputTokens = result.usage.inputTokens ?? null;
        outputTokens = result.usage.outputTokens ?? null;
        openRouterCostUsd = extractOpenRouterCostUsd(result.providerMetadata);
      }

      const latencyMs = Date.now() - startedAt;

      // Step 6: usage → cost (F.2.6/F.10.7).
      let costCents: number | null;
      let costSource: "reported" | "estimated" | "unknown";
      if (profile === "local") {
        // Free local inference — pricing.json is never consulted (F.2.6).
        costCents = 0;
        costSource = "estimated";
      } else if (profile === "openrouter" && openRouterCostUsd !== undefined) {
        costCents = openRouterCostUsd * 100;
        costSource = "reported";
      } else {
        const estimated = estimateCostCents(
          modelId,
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

      // Step 7: accounting write (also on failure, see catch below).
      await recordLlmCall({
        promptId: opts.promptId ?? null,
        profile,
        model: modelId,
        quality,
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
        model: modelId,
        profile,
        usage: { inputTokens, outputTokens },
        costCents,
        costSource,
        latencyMs,
      };
    } catch (error) {
      const latencyMs = Date.now() - startedAt;
      const errorCode = detectErrorCode(error);

      span.recordException(error instanceof Error ? error : new Error(String(error)));
      span.setAttribute("llm.error_code", errorCode);
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : String(error),
      });

      await recordLlmCall({
        promptId: opts.promptId ?? null,
        profile,
        model: modelId,
        quality,
        inputTokens: null,
        outputTokens: null,
        costCents: null,
        costSource: "unknown",
        latencyMs,
        ok: false,
        errorCode,
      });

      // Rethrow the ORIGINAL error — never wrap it.
      throw error;
    } finally {
      span.end();
    }
  });
}
