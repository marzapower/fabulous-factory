/**
 * Prompt and element schema for `runBrainstormTurn` (`./turn.ts`). The `task` string
 * below is fixed, developer-trusted text with NO interpolation of the project name,
 * pitch, board items, chat history, or the user's own message — all of that only ever
 * travels via `context`, wrapped in `untrusted()` (`@factory/core`) for anything
 * user-derived, per the kernel prompt-injection rule (`docs/agents/conventions.md`).
 * `./turn.ts` is the only caller of these.
 *
 * The element schema's payload fields are `.nullable()`, never `.optional()` (same
 * binding rule as `packages/untangle/src/tasks/prompts.ts`): `Output.array` spreads the
 * element's JSON schema with `additionalProperties: false`, and a provider in strict
 * structured-output mode rejects a property absent from `required` — an "optional" field
 * would simply never be requested.
 */
import { z } from "zod";

import { untrusted, type Untrusted } from "@factory/core/untrusted";

import type { BrainstormTurnInput } from "./turn";

export const turnElementSchema = z.object({
  kind: z.enum(["say", "idea", "feature", "note"]),
  text: z.string().nullable(),
  title: z.string().nullable(),
  detail: z.string().nullable(),
});

export function buildTurnTask(): string {
  return (
    "You are a project brainstorming partner in an ongoing chat. Converse naturally " +
    "AND propose concrete structured items for the project's board. Emit a sequence of " +
    'elements: use kind:"say" for prose paragraphs of conversation (set text, leave ' +
    'title and detail null), and kind:"idea", kind:"feature", or kind:"note" for a ' +
    "proposal (set title, optionally detail, leave text null). Only propose an item when " +
    "it is genuinely warranted by the conversation — do not propose on every turn just to " +
    "have something to show. Never propose an item that duplicates one already on the " +
    "board (the board snapshot is provided as context)."
  );
}

function formatBoardLine(item: BrainstormTurnInput["items"][number]): string {
  return `${item.kind}: ${item.title} (${item.status})`;
}

/** Builds the `context` array for `streamArray` (`./turn.ts`). ONLY the fixed labels are
 * developer-trusted; every payload here is user-derived or model-derived and travels
 * wrapped in `untrusted()`, per `GenerateOptions.context`'s own contract ("wrap
 * external/model-adjacent data with untrusted()"): the project name and pitch are typed
 * by the user, board item titles are user-typed or earlier model output, assistant
 * history turns are model output re-entering the prompt, and user turns plus the new
 * `userText` are the user's own words. */
export function buildTurnContext(
  input: Omit<BrainstormTurnInput, "emit" | "abortSignal">,
): Array<string | Untrusted<string>> {
  const context: Array<string | Untrusted<string>> = [];

  context.push(
    untrusted(`Project: ${input.projectName}${input.pitch ? `\nPitch: ${input.pitch}` : ""}`),
  );

  context.push(
    input.items.length > 0
      ? untrusted(`Board:\n${input.items.map(formatBoardLine).join("\n")}`)
      : "Board: (empty)",
  );

  for (const turn of input.history) {
    context.push(untrusted(turn.content));
  }

  context.push(untrusted(input.userText));

  return context;
}
