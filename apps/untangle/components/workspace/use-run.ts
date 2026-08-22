"use client";

import { useCallback, useReducer, useRef, useState } from "react";

import type { RunEvent } from "@factory/untangle";

import { createSseFrameParser } from "@/lib/sse";

import { initialWorkspaceState, runReducer, type WorkspaceState } from "./run-reducer";

export interface StartRunInput {
  text?: string;
  url?: string;
}

export interface UseRunResult {
  state: WorkspaceState;
  isRunning: boolean;
  /** Copy is pre-shaped by the server (`shapeError`'s `{ error: { message } }` envelope,
   * or the `POST /api/runs` route's own "wouldn't load" wording) — rendered verbatim,
   * never re-worded here (K.9's copy rule: errors say what happened, never vague). */
  error: string | null;
  start: (input: StartRunInput) => Promise<void>;
}

/**
 * Owns the `fetch` + manual stream read for `POST /api/runs` (plan K.8.1/K.8.4) — SSE
 * consumed with `fetch` and a manual frame reader rather than `EventSource`, since
 * `EventSource` is GET-only and this route is a POST that both creates and streams the
 * run on one response (K.1.5). Frames are parsed by `createSseFrameParser` (`@/lib/sse`)
 * and folded into view state by the pure `runReducer`; this hook's only job is wiring
 * the two together and tracking in-flight/error state for the component layer.
 */
export function useRun(): UseRunResult {
  const [state, dispatch] = useReducer(runReducer, initialWorkspaceState);
  const [error, setError] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const inFlight = useRef(false);

  const start = useCallback(async (input: StartRunInput) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setIsRunning(true);
    setError(null);

    try {
      const response = await fetch("/api/runs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      });

      if (!response.ok || !response.body) {
        let message = "That run couldn't start. Try again.";
        try {
          const body = (await response.json()) as { error?: { message?: string } };
          if (body?.error?.message) message = body.error.message;
        } catch {
          // Non-JSON error body — keep the generic message above.
        }
        setError(message);
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
          dispatch(frame as RunEvent);
        }
      }
    } catch {
      setError("The connection dropped before the run finished. Try again.");
    } finally {
      setIsRunning(false);
      inFlight.current = false;
    }
  }, []);

  return { state, isRunning, error, start };
}
