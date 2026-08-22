/**
 * Prompts and element schemas for the `capturePipeline`/`dailyPlanPipeline` LLM steps
 * (plan K.5.2/K.5.4). Every `task` string below is fixed, developer-trusted text with NO
 * interpolation of capture text, task titles, or any other user-derived data — that data
 * only ever travels via `context`, wrapped in `untrusted()` (`@factory/core`), per the
 * kernel prompt-injection rule (`docs/agents/conventions.md`). The steps in
 * `tasks/pipeline.ts` / `tasks/daily-plan.ts` are the only callers of these.
 *
 * Every element schema field is `.nullable()`, never `.optional()` (K.14 R1):
 * `Output.array` spreads the element's JSON schema with `additionalProperties: false`,
 * and a provider in strict structured-output mode rejects a property absent from
 * `required` — an "optional" field would simply never be requested.
 */
import { z } from "zod";

import { MAX_SUBTASKS_PER_TASK, MAX_TAG_CHARS, MAX_TITLE_CHARS } from "./constants";

export const EXTRACT_TASK =
  "Extract a list of discrete, actionable tasks from the brain-dump text provided as " +
  "context. Each task is a single short imperative title (a few words to a short " +
  "sentence) capturing one concrete action. Where possible, include a short verbatim " +
  "quote (a few words, copied exactly) from the source text that the task was derived " +
  "from — omit it, rather than paraphrase, when no clean quote exists. Ignore vague or " +
  "non-actionable remarks; do not invent tasks the text doesn't support.";

export const extractElementSchema = z.object({
  title: z.string().max(MAX_TITLE_CHARS),
  sourceQuote: z.string().max(300).nullable(),
});

export const TRIAGE_TASK =
  "A numbered list of task titles is provided as context, each on its own line as " +
  "'INDEX: title'. For EACH task, using its own index, assign: a priority ('now', " +
  "'next', or 'later'), an estimated effort in minutes (or null if you can't tell), a " +
  "due date in ISO 8601 date format if the title implies one (or null), a short " +
  "single-word category tag (or null), and whether the task is complex enough to be " +
  "worth breaking into a few subtasks (needsBreakdown). Today's date is provided as " +
  "trusted context, to resolve relative dates such as 'tomorrow' or a weekday name.";

export const triageElementSchema = z.object({
  index: z.number().int(),
  priority: z.enum(["now", "next", "later"]),
  effortMinutes: z.number().int().nullable(),
  dueAt: z.string().nullable(),
  tag: z.string().max(MAX_TAG_CHARS).nullable(),
  needsBreakdown: z.boolean(),
});

export const DECOMPOSE_TASK =
  "A numbered list of task titles that each need breaking down is provided as context, " +
  "each on its own line as 'INDEX: title'. For EACH one, using its own index, produce " +
  `up to ${MAX_SUBTASKS_PER_TASK} short subtask titles that together accomplish the ` +
  "parent task. Keep each subtask a single concrete action.";

export const decomposeElementSchema = z.object({
  index: z.number().int(),
  subtasks: z.array(z.string().max(MAX_TITLE_CHARS)).max(MAX_SUBTASKS_PER_TASK),
});

export const FOCUS_TASK =
  "A numbered list of a user's open tasks is provided as context, each on its own line " +
  "as 'INDEX: title (due DATE)' or 'INDEX: title' when there's no due date. Choose the " +
  "ones that matter most to work on today, in priority order, using each one's own " +
  "index, and give a short one-line reason for each choice (why it matters today). " +
  "Today's date is provided as trusted context.";

export const focusElementSchema = z.object({
  index: z.number().int(),
  reason: z.string().max(300).nullable(),
});

/** Renders a zero-based, index-labelled list — the shared shape every prompt above
 * expects its context list in. The caller is responsible for wrapping the result in
 * `untrusted()` (the items are always user-derived). */
export function formatIndexedList(items: string[]): string {
  return items.map((item, index) => `${index}: ${item}`).join("\n");
}
