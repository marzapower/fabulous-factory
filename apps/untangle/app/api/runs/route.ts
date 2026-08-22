import { z } from "zod";

import { getEntitlement } from "@factory/billing";
import { ApiError, defineHandler, safeFetch } from "@factory/core";
import {
  capturePipeline,
  createCapture,
  createRun,
  inlineDriver,
  MAX_CAPTURE_CHARS,
  normalizeContent,
  runPipeline,
  URL_FETCH_MAX_BYTES,
  URL_FETCH_TIMEOUT_MS,
  type CaptureState,
  type RunEvent,
} from "@factory/untangle";

export const dynamic = "force-dynamic";

const runsInput = z
  .object({
    text: z.string().max(MAX_CAPTURE_CHARS).optional(),
    url: z.url({ protocol: /^https?$/ }).optional(),
  })
  .refine((v) => Boolean(v.text?.trim()) !== Boolean(v.url), "Provide either text or a URL");

/**
 * A tiny enqueue-after-close guard around the stream controller (K.8.1 step 5). A
 * cancelled client (`ReadableStream.cancel`, fired when the tab closes or the fetch is
 * aborted) must never turn a subsequent `emit`/`controller.close()` call into an
 * unhandled `TypeError` — the run keeps executing and writing to the DB regardless
 * (`req.signal` is deliberately NOT forwarded into `runPipeline` below), so writes to
 * the now-dead stream must fail silently instead.
 */
class SseWriter {
  private closed = false;
  private readonly encoder = new TextEncoder();

  constructor(private readonly controller: ReadableStreamDefaultController<Uint8Array>) {}

  write(event: RunEvent): void {
    if (this.closed) return;
    try {
      this.controller.enqueue(this.encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
    } catch {
      // The controller was already closed/errored out from under us (e.g. the client
      // disconnected between our `closed` check and this call) — swallow it.
      this.closed = true;
    }
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    try {
      this.controller.close();
    } catch {
      // Already closed by a cancelled reader — nothing left to do.
    }
  }

  /** Marks the writer closed WITHOUT touching the controller — used from `cancel()`,
   * where the controller is already gone and calling `close()`/`enqueue()` on it again
   * would throw. */
  markCancelled(): void {
    this.closed = true;
  }
}

export const POST = defineHandler({
  auth: "required",
  input: runsInput,
  rateLimit: { windowSeconds: 60, max: 6 },
  handler: async ({ session, input }) => {
    const userId = session.user.id;

    // Step 1 (K.8.1): resolve the capture text BEFORE anything is written to the DB, so
    // a bad URL never leaves an orphaned capture/run behind.
    let source: "paste" | "url";
    let url: string | null = null;
    let rawText: string;

    if (input.url) {
      source = "url";
      url = input.url;
      let fetched: string;
      try {
        const response = await safeFetch(input.url, {
          maxBytes: URL_FETCH_MAX_BYTES,
          timeoutMs: URL_FETCH_TIMEOUT_MS,
        });
        fetched = await response.text();
      } catch {
        throw new ApiError(422, "fetch_failed", "That page wouldn't load. Paste the text instead.");
      }
      rawText = normalizeContent(fetched);
      if (!rawText) {
        throw new ApiError(
          422,
          "empty_capture",
          "That page had no readable text. Paste the text instead.",
        );
      }
    } else {
      source = "paste";
      // `input.text` is guaranteed present here by the schema's `.refine` (exactly one
      // of `text`/`url` is set).
      rawText = input.text!.trim();
    }

    // Step 2 (K.8.1): entitlement is resolved HERE, at the handler layer — never inside
    // `createRun`'s advisory-locked transaction, which would open a second pool
    // checkout against the same request.
    const entitlement = await getEntitlement(userId);

    // Step 3: a cap rejection from `createRun` throws `ApiError(422, "run_limit_reached")`
    // synchronously, BEFORE the stream is ever opened — it propagates straight through
    // `defineHandler`'s catch/`shapeError` as an ordinary JSON 422, not a frame inside a
    // stream that already started.
    const capture = await createCapture({ userId, source, url, rawText });
    const run = await createRun({
      userId,
      kind: "capture",
      driver: "inline",
      runsPerDay: entitlement.runsPerDay,
      enforceLimit: true,
    });

    // Step 4: only now does the stream open.
    // Declared outside `start()` so `cancel()` (a sibling callback, invoked when the
    // client disconnects) can reach the same writer instance and flip it closed.
    let writer: SseWriter | undefined;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        // A local `const` alias, captured once: TS can't narrow the outer `let writer`
        // across the closures below (it's reassigned from a sibling scope in principle),
        // but this instance never changes for the lifetime of this stream.
        const activeWriter = new SseWriter(controller);
        writer = activeWriter;

        const seed: CaptureState = {
          captureId: capture.id,
          rawText,
          todayIso: new Date().toISOString().slice(0, 10),
          tasks: [],
        };

        // `req.signal` is deliberately NOT passed as `signal` here (K.8.1 step 5): a
        // closed tab must not cancel work already paid for (the run row already exists)
        // and already partly committed (`runPipeline` commits each step independently,
        // per K.14 R2) — cancelling mid-run would leave a truthful but needlessly
        // incomplete record when the pipeline could otherwise have finished on its own.
        void runPipeline({
          runId: run.id,
          userId,
          steps: capturePipeline,
          seed,
          driver: inlineDriver,
          emit: (event) => activeWriter.write(event),
        })
          .catch(() => {
            // `runPipeline` rethrows exactly once: when an `onFailure: "abort"` step
            // fails (K.14 M1). By the time it does, it has ALREADY called
            // `finishRun(runId, "failed", …)` and emitted the terminal `run-finished`
            // frame itself (`packages/untangle/src/runs/engine.ts`) — this `catch` exists
            // solely to stop that rethrow from becoming an unhandled promise rejection.
            // A cap rejection (`run_limit_reached`) is a completely different path: it
            // throws BEFORE `createRun` even returns, so it never reaches here — it
            // surfaces as a plain 422 response, with no stream ever opened.
          })
          .finally(() => {
            writer?.close();
          });
      },
      cancel() {
        // The client disconnected. The controller itself is already gone from under us,
        // so don't attempt to close it again through `SseWriter.close()` — just flip the
        // writer straight to closed, so every future `write()` call from the still-
        // running `runPipeline` above becomes a silent no-op instead of an unhandled
        // enqueue-on-a-dead-controller error. `runPipeline` itself keeps running
        // unaffected: no signal was forwarded to it, so a disconnected tab never cancels
        // work already paid for and already partly committed (K.8.1 step 5).
        writer?.markCancelled();
      },
    });

    return new Response(stream, {
      headers: {
        "content-type": "text/event-stream",
        "cache-control": "no-cache, no-transform",
        connection: "keep-alive",
        "x-accel-buffering": "no",
      },
    });
  },
});
