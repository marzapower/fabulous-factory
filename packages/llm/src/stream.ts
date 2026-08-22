/**
 * `streamArray()` — the streaming counterpart to `generate()` (plan K.3.2), sharing the
 * exact budget/cost/OTel/`llm_calls` accounting extracted into `./call.ts` so neither
 * path forks it. Runtime order mirrors `generate()`:
 *   1. `prepareCall(opts)` — disabled check, routing, prompt assembly, budget pre-check.
 *   2. `tracer.startActiveSpan("llm.stream_array", ...)`,
 *      `gen_ai.operation.name = "stream_text"`.
 *   3. `streamText({ ...callOptions, output: Output.array({ element }) })`.
 *   4. WE drain `result.elementStream` ourselves, in arrival order — the consumer never
 *      owns the iterator, so the `llm_calls` write and span closure can never be skipped
 *      by an abandoned stream. Each element is accumulated and (inside a try/catch)
 *      handed to `onElement`.
 *   5. `result.usage` / `result.providerMetadata` (NOT `result.output` — see the M4 note
 *      on `streamArray` below) → `finalizeCall`.
 *   6. Any throw from 3-5 → `recordCallFailure`, then rethrow the original error.
 */
import { Output, streamText } from "ai";
import type { z } from "zod";

import { captureException, tracer } from "@factory/observability";

import { extractOpenRouterCostUsd, finalizeCall, prepareCall, recordCallFailure } from "./call";
import type { GenerateOptions, GenerateResult } from "./call";

export interface StreamArrayOptions<S extends z.ZodType> extends GenerateOptions {
  /** Schema of ONE array element. */
  element: S;
  /** Invoked once per element, in arrival order, as the model completes it.
   *  A throw here is caught and logged — it never fails the call. */
  onElement?: (element: z.infer<S>, index: number) => void;
}

/**
 * Streams an array of `element`-shaped objects, invoking `onElement` as each one
 * completes, and resolves with the array actually delivered over the wire.
 *
 * **M4 trade (binding — verified against `ai@7.0.68` `dist/index.js:3653-3700`):**
 * `Output.array`'s `parseCompleteOutput` throws `NoObjectGeneratedError` if ANY element
 * fails schema validation, while its streaming counterpart `parsePartialOutput` silently
 * skips invalid elements and, on a "repaired" (best-effort) parse, drops the trailing
 * element outright. The two can legitimately disagree — so `await result.output` can
 * throw AFTER `onElement` already fired for earlier elements and, in this package's real
 * callers, after a row derived from one of those elements was already inserted and
 * streamed to a client. `streamArray` therefore NEVER awaits `result.output`: it
 * accumulates elements from `elementStream` as it drains them and resolves
 * `GenerateResult.output` with that accumulated array instead. Usage and cost still come
 * from `result.usage` / `result.providerMetadata`, which resolve independently in the
 * base transform's flush. Consequence, stated plainly: a malformed trailing element is
 * dropped rather than failing the whole call — the honest trade for never orphaning a row
 * a caller already committed. `test/stream.test.ts` covers exactly this case.
 */
export async function streamArray<S extends z.ZodType>(
  opts: StreamArrayOptions<S>,
): Promise<GenerateResult<Array<z.infer<S>>>> {
  const prepared = await prepareCall(opts);

  return tracer.startActiveSpan("llm.stream_array", async (span) => {
    const startedAt = Date.now();

    span.setAttribute("gen_ai.operation.name", "stream_text");
    span.setAttribute("gen_ai.request.model", prepared.modelId);
    span.setAttribute("llm.profile", prepared.profile);
    span.setAttribute("llm.quality", prepared.quality);
    if (opts.promptId !== undefined) {
      span.setAttribute("llm.prompt_id", opts.promptId);
    }

    try {
      const result = streamText({
        model: prepared.model,
        instructions: prepared.instructions,
        prompt: prepared.prompt,
        maxRetries: 2,
        timeout: opts.timeoutMs ?? 60_000,
        abortSignal: opts.abortSignal,
        maxOutputTokens: prepared.enforcedMaxOutputTokens,
        output: Output.array({ element: opts.element }),
      });

      // Step 4: WE own the drain loop (K.3.2) — never `await result.output` (M4, above).
      const accumulated: Array<z.infer<S>> = [];
      let index = 0;
      for await (const element of result.elementStream) {
        const typedElement = element as z.infer<S>;
        accumulated.push(typedElement);
        if (opts.onElement) {
          try {
            opts.onElement(typedElement, index);
          } catch (callbackError) {
            captureException(callbackError, { source: "streamArray.onElement", index });
          }
        }
        index += 1;
      }

      const usage = await result.usage;
      const providerMetadata = await result.providerMetadata;
      const inputTokens = usage.inputTokens ?? null;
      const outputTokens = usage.outputTokens ?? null;
      const openRouterCostUsd = extractOpenRouterCostUsd(
        providerMetadata as Record<string, unknown> | undefined,
      );

      return await finalizeCall({
        prepared,
        span,
        startedAt,
        promptId: opts.promptId,
        output: accumulated,
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
