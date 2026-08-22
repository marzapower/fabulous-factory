/**
 * `runBrainstormTurn` — the brainstorm preset's one LLM step: a single conversational
 * turn that both replies in prose and proposes structured board items in the same
 * streamed call.
 *
 * Design note on `streamArray`'s `onElement` — the same split
 * `packages/untangle/src/tasks/pipeline.ts` documents at its own header: `onElement`'s
 * signature is `(element, index) => void` and `streamArray` does NOT await it, so kicking
 * off a DB insert inside it would race the step's own return. `mapTurnElement` (below) is
 * therefore SYNCHRONOUS ONLY — it mints an id and shapes an event, nothing that can still
 * be in flight when `streamArray` resolves. This module never persists anything itself;
 * that is entirely the caller's job, using the ids `mapTurnElement` already minted.
 *
 * `runBrainstormTurn` emits ONLY `say`/`proposal` events as they arrive — `turn-started`,
 * `turn-finished`, and `turn-error` are the caller's (the route's) job, since only the
 * caller knows whether persistence afterward succeeded. It does not check
 * `isEnabled("llm")` (that's `./gate.ts`'s job, checked by the caller before this is ever
 * invoked) and it THROWS on an LLM failure — the caller maps that throw to a
 * `turn-error` frame.
 */
import { streamArray } from "@factory/llm";

import { buildTurnContext, buildTurnTask, turnElementSchema } from "./prompts";
import type { ItemKind, ProjectItem, ProjectRole, TurnEvent, TurnProposal } from "./types";

export interface BrainstormTurnInput {
  projectName: string;
  pitch: string | null;
  history: Array<{ role: ProjectRole; content: string }>;
  items: Array<Pick<ProjectItem, "kind" | "title" | "status">>;
  userText: string;
  emit: (ev: TurnEvent) => void;
  abortSignal?: AbortSignal;
}

const TURN_MAX_OUTPUT_TOKENS = 2048;
const TURN_MAX_COST_CENTS = 10;
const TURN_TIMEOUT_MS = 45_000;

/**
 * Pure mapping from one streamed element to the `TurnEvent` it produces, or `null` when
 * the element is malformed and should be dropped silently: a `"say"` element with a
 * null/empty `text`, or an item element (`"idea"|"feature"|"note"`) with a null/empty
 * `title`. `mint` is injected so this stays testable without touching `crypto` directly —
 * `runBrainstormTurn` passes `() => crypto.randomUUID()`. `detail` defaults to `null`
 * when omitted by the model.
 */
export function mapTurnElement(
  element: {
    kind: "say" | ItemKind;
    text: string | null;
    title: string | null;
    detail: string | null;
  },
  index: number,
  mint: () => string,
): TurnEvent | null {
  if (element.kind === "say") {
    const text = element.text?.trim();
    if (!text) return null;
    return { type: "say", text, index };
  }

  const title = element.title?.trim();
  if (!title) return null;

  const proposal: TurnProposal = {
    id: mint(),
    kind: element.kind,
    title,
    detail: element.detail ?? null,
  };
  return { type: "proposal", proposal, index };
}

export async function runBrainstormTurn(
  input: BrainstormTurnInput,
): Promise<{ sayText: string; proposals: TurnProposal[]; costCents: number | null }> {
  const sayParts: string[] = [];
  const proposals: TurnProposal[] = [];

  const result = await streamArray({
    task: buildTurnTask(),
    context: buildTurnContext({
      projectName: input.projectName,
      pitch: input.pitch,
      history: input.history,
      items: input.items,
      userText: input.userText,
    }),
    element: turnElementSchema,
    quality: "balanced",
    maxOutputTokens: TURN_MAX_OUTPUT_TOKENS,
    maxCostCents: TURN_MAX_COST_CENTS,
    timeoutMs: TURN_TIMEOUT_MS,
    abortSignal: input.abortSignal,
    // SYNCHRONOUS ONLY — see the file header. No awaits, no DB, nothing that can still be
    // in flight when `streamArray` resolves.
    onElement: (element, index) => {
      const event = mapTurnElement(element, index, () => crypto.randomUUID());
      if (!event) return;
      if (event.type === "say") {
        sayParts.push(event.text);
      } else if (event.type === "proposal") {
        proposals.push(event.proposal);
      }
      input.emit(event);
    },
  });

  return {
    sayText: sayParts.join("\n\n"),
    proposals,
    costCents: result.costCents,
  };
}
