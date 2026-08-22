import { z } from "zod";

import {
  appendMessageForUser,
  assertLlmChatEnabled,
  countUserTurnsToday,
  createItemForUser,
  getProjectForUser,
  listItemsForProject,
  listMessagesForProject,
  runBrainstormTurn,
  type TurnEvent,
} from "@factory/brainstorm";
import { isEnabled } from "@factory/config";
import { ApiError, defineHandler } from "@factory/core";

export const dynamic = "force-dynamic";

const chatInput = z.object({
  projectId: z.uuid(),
  text: z.string().trim().min(1).max(4000),
});

/** Last N messages loaded as turn context — bounds the prompt regardless of how long a
 * project's history has grown. */
const HISTORY_LIMIT = 30;

/** S1 abuse floor: an aggregate per-user daily turn ceiling, mirroring the same
 * per-user daily run ceiling the Untangle preset's run engine enforces (a different
 * preset's domain package, not present in this scaffold) — the 10/min rate limit
 * above bounds burst speed but not total daily spend. At worst ~10 cents per turn, 200
 * turns/day caps a single user's worst-case exposure at ~$20/day. */
const TURN_HARD_CEILING_PER_DAY = 200;

/** Persisted verbatim when a turn produces no prose at all (`finishedStatus === "empty"`)
 * — the client renders the identical string for the live, not-yet-persisted case
 * (`components/workbench/chat-pane.tsx`), so the transcript never disagrees with itself
 * across a page reload. */
const EMPTY_TURN_MESSAGE = "I came up empty — try giving me one more concrete detail.";

/** A tiny enqueue-after-close guard around the stream controller — mirrors
 * `apps/untangle/app/api/runs/route.ts`'s `SseWriter` exactly (same rationale: a
 * cancelled client must never turn a subsequent `emit`/`controller.close()` call into an
 * unhandled `TypeError`, and the turn keeps running to completion regardless — `req.signal`
 * is deliberately NOT forwarded into `runBrainstormTurn` below, for the same reason the
 * runs route doesn't forward it into `runPipeline`: committed work should finish). */
class SseWriter {
  private closed = false;
  private readonly encoder = new TextEncoder();

  constructor(private readonly controller: ReadableStreamDefaultController<Uint8Array>) {}

  write(event: TurnEvent): void {
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
  input: chatInput,
  rateLimit: { windowSeconds: 60, max: 10 },
  handler: async ({ session, input }) => {
    const userId = session.user.id;

    // ALL fallible pre-work happens BEFORE the stream opens (mirrors
    // apps/untangle/app/api/runs/route.ts's own K.8.1 step ordering) — a rejection here
    // propagates straight through `defineHandler`'s catch/`shapeError` as an ordinary JSON
    // error, never as a frame inside a stream that already started.

    // (1) The chat surface is gated behind an LLM key; the board itself never is.
    assertLlmChatEnabled(isEnabled("llm"));

    // (2) S1 abuse floor — an aggregate daily turn ceiling on top of the 10/min rate
    // limit above (see `TURN_HARD_CEILING_PER_DAY`'s doc comment).
    if ((await countUserTurnsToday(userId)) >= TURN_HARD_CEILING_PER_DAY) {
      throw new ApiError(
        422,
        "turn_limit_reached",
        "Daily brainstorming limit reached — come back tomorrow.",
      );
    }

    // (3) Ownership check — scoped by (id, userId) at the query layer, not a second,
    // unscoped lookup on top of it.
    const project = await getProjectForUser(input.projectId, userId);
    if (!project) {
      throw new ApiError(404, "project_not_found", "That project is gone already.");
    }

    // (4) Turn context — bounded history plus every item (not just accepted ones: the
    // model should know what's already been proposed and dismissed too, so it doesn't
    // re-propose the same idea a beat later).
    const [allMessages, items] = await Promise.all([
      listMessagesForProject(input.projectId, userId),
      listItemsForProject(input.projectId, userId),
    ]);
    const history = allMessages
      .slice(-HISTORY_LIMIT)
      .map((message) => ({ role: message.role, content: message.content }));

    // (5) The user's own message is persisted regardless of how the turn below goes —
    // it was said, whether or not the model manages to reply.
    await appendMessageForUser(input.projectId, userId, "user", input.text);

    // (6) Only now does the stream open.
    let writer: SseWriter | undefined;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const activeWriter = new SseWriter(controller);
        writer = activeWriter;
        activeWriter.write({ type: "turn-started" });

        void runBrainstormTurn({
          projectName: project.name,
          pitch: project.pitch,
          history,
          items,
          userText: input.text,
          emit: (event) => activeWriter.write(event),
          // Deliberately NOT `req.signal` — a closed tab must not cancel work already
          // paid for (the user's message is already committed) or discard a reply that
          // was already streamed to the model, same rationale as the runs route.
        })
          .then(async (result) => {
            try {
              const sayContent = result.sayText || EMPTY_TURN_MESSAGE;
              await appendMessageForUser(input.projectId, userId, "assistant", sayContent);
              for (const proposal of result.proposals) {
                await createItemForUser(input.projectId, userId, {
                  id: proposal.id,
                  kind: proposal.kind,
                  title: proposal.title,
                  detail: proposal.detail,
                  source: "ai",
                  status: "proposed",
                });
              }
            } catch {
              activeWriter.write({ type: "turn-error", code: "persist_failed" });
              return;
            }

            activeWriter.write({
              type: "turn-finished",
              status: result.proposals.length > 0 || result.sayText ? "ok" : "empty",
              costCents: result.costCents,
            });
          })
          .catch(() => {
            // `runBrainstormTurn` throws on an LLM failure (never on a persistence
            // failure — that's caught above, inside the `.then`).
            activeWriter.write({ type: "turn-error", code: "llm_failed" });
          })
          .finally(() => {
            writer?.close();
          });
      },
      cancel() {
        // The client disconnected — flip the writer closed so every future `write()`
        // from the still-running turn above becomes a silent no-op instead of an
        // unhandled enqueue-on-a-dead-controller error. The turn itself keeps running
        // unaffected (no signal was forwarded to it).
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
