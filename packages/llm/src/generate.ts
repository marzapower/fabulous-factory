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
 *
 * Steps 1-3 and 6-8 are shared with `streamArray` (`./stream.ts`) via `./call.ts`
 * (plan K.3.1) — this file owns only step 4's span lifecycle and step 5's provider call.
 */
import { generateText, Output } from "ai";
import type { z } from "zod";

import { tracer } from "@factory/observability";

import { extractOpenRouterCostUsd, finalizeCall, prepareCall, recordCallFailure } from "./call";
import type { GenerateOptions, GenerateResult } from "./call";

export type { GenerateOptions, GenerateResult };

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
  const prepared = await prepareCall(opts);
  const schema = opts.schema;

  return tracer.startActiveSpan("llm.generate", async (span) => {
    const startedAt = Date.now();

    span.setAttribute("gen_ai.operation.name", "generate_text");
    span.setAttribute("gen_ai.request.model", prepared.modelId);
    span.setAttribute("llm.profile", prepared.profile);
    span.setAttribute("llm.quality", prepared.quality);
    if (opts.promptId !== undefined) {
      span.setAttribute("llm.prompt_id", opts.promptId);
    }

    try {
      let output: unknown;
      let inputTokens: number | null;
      let outputTokens: number | null;
      let openRouterCostUsd: number | undefined;

      const callOptions = {
        model: prepared.model,
        instructions: prepared.instructions,
        prompt: prepared.prompt,
        maxRetries: 2,
        timeout: opts.timeoutMs ?? 60_000,
        abortSignal: opts.abortSignal,
        maxOutputTokens: prepared.enforcedMaxOutputTokens,
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

      return await finalizeCall({
        prepared,
        span,
        startedAt,
        promptId: opts.promptId,
        output,
        inputTokens,
        outputTokens,
        openRouterCostUsd,
      });
    } catch (error) {
      await recordCallFailure({ prepared, span, startedAt, promptId: opts.promptId, error });
      // Rethrow the ORIGINAL error — never wrap it.
      throw error;
    } finally {
      span.end();
    }
  });
}
