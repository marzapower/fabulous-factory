/**
 * `turnReducer` — the single source of truth for one chat turn's live view
 * (`POST /api/chat`'s SSE stream folded into state a component can render directly). Pure,
 * no DOM, no I/O — same shape as `apps/untangle/components/workspace/run-reducer.ts`, but
 * over `TurnEvent` (`@factory/brainstorm`) instead of `RunEvent`.
 *
 * A turn's chunks (`say`/`proposal`) are kept in ARRIVAL ORDER in one list — that ordering
 * is what lets the chat pane render prose and proposal cards interleaved exactly the way
 * the model produced them, rather than grouping all prose before all cards.
 *
 * Local lifecycle (not literal `TurnEvent`s, folded in via the same `dispatch`):
 *   - `reset`       — a fresh submission begins; clears everything back to "streaming".
 *   - `card-status` — the user accepted/dismissed a proposal card that is still part of
 *                     THIS turn's live chunk list (an already-folded turn's cards are
 *                     tracked by the board's own item state instead, not by this reducer).
 *
 * Error mapping (`turn-error`):
 *   - `llm_failed`    → `phase: "error"`, a retryable error line. Nothing was persisted
 *                       server-side for this turn (the route only appends the user's own
 *                       message before running it), so chunks are discarded — showing a
 *                       partial reply that was never saved would be dishonest.
 *   - `persist_failed`→ `phase: "error"`, chunks KEPT but every proposal chunk is flagged
 *                       `unsaved: true` (the caller disables accept/dismiss on those and
 *                       shows a note) — the say/proposal content did stream successfully,
 *                       persistence afterward is what failed.
 *   - `llm_disabled`  → `phase: "disabled"`, the chat-off state. In practice this arrives
 *                       as a pre-stream 503 the caller maps to this same action rather
 *                       than a literal SSE frame (`assertLlmChatEnabled` throws before the
 *                       stream ever opens) — handled here too so the fold stays total over
 *                       every `TurnEvent` shape the type allows.
 */
import type { TurnEvent, TurnProposal } from "@factory/brainstorm";

export type TurnChunk =
  | { kind: "say"; index: number; text: string }
  | {
      kind: "proposal";
      index: number;
      proposal: TurnProposal;
      status: "pending" | "accepted" | "dismissed";
      unsaved: boolean;
    };

export type TurnPhase = "idle" | "streaming" | "finished" | "error" | "disabled";

export interface TurnState {
  phase: TurnPhase;
  chunks: TurnChunk[];
  finishedStatus: "ok" | "empty" | null;
  costCents: number | null;
  error: { code: "llm_failed" | "persist_failed"; message: string } | null;
  disabledMessage: string | null;
}

export const initialTurnState: TurnState = {
  phase: "idle",
  chunks: [],
  finishedStatus: null,
  costCents: null,
  error: null,
  disabledMessage: null,
};

export type TurnReducerAction =
  | TurnEvent
  | { type: "reset" }
  | { type: "card-status"; id: string; status: "accepted" | "dismissed" };

const LLM_FAILED_MESSAGE = "That turn failed. Try again.";
const PERSIST_FAILED_MESSAGE = "That reply didn't save — refresh before trusting these cards.";
const LLM_DISABLED_MESSAGE = "Chat needs an LLM key — see /features/llm. Your board still works.";

export function turnReducer(state: TurnState, action: TurnReducerAction): TurnState {
  switch (action.type) {
    case "reset":
      return { ...initialTurnState, phase: "streaming" };

    case "turn-started":
      // Idempotent — a duplicate `turn-started` for the turn already streaming is a no-op.
      return state.phase === "streaming" ? state : { ...initialTurnState, phase: "streaming" };

    case "say": {
      if (state.phase !== "streaming") return state;
      const chunk: TurnChunk = { kind: "say", index: action.index, text: action.text };
      return { ...state, chunks: [...state.chunks, chunk] };
    }

    case "proposal": {
      if (state.phase !== "streaming") return state;
      const chunk: TurnChunk = {
        kind: "proposal",
        index: action.index,
        proposal: action.proposal,
        status: "pending",
        unsaved: false,
      };
      return { ...state, chunks: [...state.chunks, chunk] };
    }

    case "turn-finished":
      return {
        ...state,
        phase: "finished",
        finishedStatus: action.status,
        costCents: action.costCents,
      };

    case "turn-error": {
      if (action.code === "llm_disabled") {
        return { ...initialTurnState, phase: "disabled", disabledMessage: LLM_DISABLED_MESSAGE };
      }
      if (action.code === "persist_failed") {
        const chunks = state.chunks.map((chunk) =>
          chunk.kind === "proposal" ? { ...chunk, unsaved: true } : chunk,
        );
        return {
          ...state,
          phase: "error",
          chunks,
          error: { code: "persist_failed", message: PERSIST_FAILED_MESSAGE },
        };
      }
      // "llm_failed" — nothing was persisted for this turn; discard any partial chunks
      // rather than show a reply that was never saved.
      return {
        ...state,
        phase: "error",
        chunks: [],
        error: { code: "llm_failed", message: LLM_FAILED_MESSAGE },
      };
    }

    case "card-status": {
      const chunks = state.chunks.map((chunk) =>
        chunk.kind === "proposal" && chunk.proposal.id === action.id && !chunk.unsaved
          ? { ...chunk, status: action.status }
          : chunk,
      );
      return { ...state, chunks };
    }

    default:
      return state;
  }
}
