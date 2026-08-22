"use client";

import { useCallback, useReducer, useRef, useState } from "react";

import type { TurnEvent } from "@factory/brainstorm";

import { createSseFrameParser } from "@/lib/sse";

import { initialTurnState, turnReducer, type TurnState } from "./turn-reducer";

export interface UseTurnResult {
  state: TurnState;
  isStreaming: boolean;
  /** Pre-stream failure only (rate-limited, project not found, a dropped connection) —
   * copy is pre-shaped by the server (`shapeError`'s `{ error: { message } }` envelope),
   * rendered verbatim, same convention `apps/untangle/components/workspace/use-run.ts`
   * follows. `llm_disabled` is deliberately NOT routed here — it is folded into
   * `state.phase === "disabled"` instead, so the chat-off state has exactly one source of
   * truth regardless of whether it arrived as a pre-stream 503 or (defensively) as an SSE
   * `turn-error` frame. */
  error: string | null;
  submit: (text: string) => Promise<void>;
  /** Optimistic accept/dismiss on a proposal card that is still part of the currently
   * displayed (unfolded) turn — a thin wrapper so callers never construct the reducer
   * action shape themselves. */
  setCardStatus: (id: string, status: "accepted" | "dismissed") => void;
}

/**
 * Owns the `fetch` + manual stream read for `POST /api/chat` — mirrors
 * `apps/untangle/components/workspace/use-run.ts` exactly (SSE consumed with `fetch` and a
 * manual frame reader, not `EventSource`, since this route is a POST). Frames are parsed
 * by `createSseFrameParser` (`@/lib/sse`) and folded into view state by the pure
 * `turnReducer`; this hook's only job is wiring the two together.
 */
export function useTurn(projectId: string): UseTurnResult {
  const [state, dispatch] = useReducer(turnReducer, initialTurnState);
  const [error, setError] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const inFlight = useRef(false);

  const submit = useCallback(
    async (text: string) => {
      if (inFlight.current) return;
      inFlight.current = true;
      setIsStreaming(true);
      setError(null);
      dispatch({ type: "reset" });

      try {
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ projectId, text }),
        });

        if (!response.ok || !response.body) {
          let code: string | undefined;
          let message = "That message couldn't send. Try again.";
          try {
            const body = (await response.json()) as { error?: { code?: string; message?: string } };
            code = body?.error?.code;
            if (body?.error?.message) message = body.error.message;
          } catch {
            // Non-JSON error body — keep the generic message above.
          }
          if (code === "llm_disabled") {
            dispatch({ type: "turn-error", code: "llm_disabled" });
          } else {
            setError(message);
          }
          return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        const parseChunk = createSseFrameParser();

        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          for (const frame of parseChunk(chunk)) {
            dispatch(frame as TurnEvent);
          }
        }
      } catch {
        setError("The connection dropped before the reply finished. Try again.");
      } finally {
        setIsStreaming(false);
        inFlight.current = false;
      }
    },
    [projectId],
  );

  const setCardStatus = useCallback((id: string, status: "accepted" | "dismissed") => {
    dispatch({ type: "card-status", id, status });
  }, []);

  return { state, isStreaming, error, submit, setCardStatus };
}
