/**
 * Pure, no-I/O heuristic fallbacks (plan K.5.3) — the proof this whole domain works with
 * zero API keys. `heuristicExtract`'s offsets are computed directly off `rawText`, so
 * they are exact by construction; the LLM path (`tasks/pipeline.ts`) has to reconstruct
 * an anchor after the fact via `locateQuote`, which can fail. The heuristic path
 * therefore has BETTER provenance than the LLM path, not worse.
 */
import { MAX_TASKS_PER_RUN, MIN_TASK_CHARS, type Priority, MAX_TITLE_CHARS } from "./constants";

export interface HeuristicTask {
  title: string;
  sourceStart: number;
  sourceEnd: number;
}

/**
 * Leading indentation plus an optional single bullet/numbering marker (`-`, `*`, `•`,
 * `1.`, `1)`), plus the whitespace that follows it — all consumed in one match so a
 * marker-less line still matches (with an empty marker), just trimming its leading
 * whitespace. `rawText.slice(sourceStart, sourceEnd)` always equals the returned `title`
 * exactly: `sourceStart` is the line's start offset plus this match's length, and
 * `sourceEnd` is `sourceStart + title.length` after trimming trailing whitespace.
 */
const MARKER_RE = /^\s*(?:[-*•]|\d+[.)])?\s*/;

export function heuristicExtract(rawText: string): HeuristicTask[] {
  const tasks: HeuristicTask[] = [];
  let offset = 0;
  const lines = rawText.split("\n");

  for (const line of lines) {
    const lineStart = offset;
    // `split("\n")` consumes the separator itself — account for it so the NEXT line's
    // offset lands correctly, even though this line's own slice never includes it.
    offset += line.length + 1;

    const marker = line.match(MARKER_RE)?.[0] ?? "";
    const rest = line.slice(marker.length);
    // Truncate rather than drop (the LLM path's zod `.max()` drops an over-long element
    // instead). A wall of pasted text with no newlines is ONE line here, and on the
    // keyless baseline that is the whole product — dropping it would leave the user with
    // nothing, so the heuristic keeps the task and shortens the title.
    const title = rest.trimEnd().slice(0, MAX_TITLE_CHARS);
    if (title.length < MIN_TASK_CHARS) continue;

    const sourceStart = lineStart + marker.length;
    const sourceEnd = sourceStart + title.length;
    tasks.push({ title, sourceStart, sourceEnd });
    if (tasks.length >= MAX_TASKS_PER_RUN) break;
  }

  return tasks;
}

/** Keyword priority: an "urgent" vocabulary wins 'now', a "someday" vocabulary wins
 * 'later', everything else defaults to 'next'. Deliberately simple — a real prioritizer
 * is what the LLM path is for; this is the floor, not a competing feature. */
const NOW_KEYWORDS = ["asap", "urgent", "today", "tonight", "!"];
const LATER_KEYWORDS = ["someday", "maybe", "eventually"];

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

function addDays(date: Date, days: number): Date {
  const copy = new Date(date);
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

function isoDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function nextWeekday(today: Date, targetDay: number): Date {
  const currentDay = today.getUTCDay();
  // `|| 7`: a title naming TODAY's own weekday means "next week's <day>", never "today"
  // itself — that ambiguity belongs to the today/tomorrow branches above, which run
  // first and win.
  const delta = (targetDay - currentDay + 7) % 7 || 7;
  return addDays(today, delta);
}

function resolveHeuristicDueDate(lowerTitle: string, today: Date): string | null {
  if (lowerTitle.includes("today") || lowerTitle.includes("tonight")) {
    return isoDateOnly(today);
  }
  if (lowerTitle.includes("tomorrow")) {
    return isoDateOnly(addDays(today, 1));
  }
  for (const [index, weekday] of WEEKDAYS.entries()) {
    if (lowerTitle.includes(weekday)) {
      return isoDateOnly(nextWeekday(today, index));
    }
  }
  return null;
}

/** No effort estimate, no tag — the heuristic path never invents either (K.5.3's
 * documented shape). `dueAt` is an ISO date-only string (K.1.8: never a `Date` in
 * anything that flows through pipeline state). */
export function heuristicTriage(
  titles: string[],
  todayIso: string,
): Array<{
  index: number;
  priority: Priority;
  effortMinutes: null;
  dueAt: string | null;
  tag: null;
}> {
  const today = new Date(todayIso);
  return titles.map((title, index) => {
    const lower = title.toLowerCase();
    let priority: Priority = "next";
    if (NOW_KEYWORDS.some((keyword) => lower.includes(keyword))) {
      priority = "now";
    } else if (LATER_KEYWORDS.some((keyword) => lower.includes(keyword))) {
      priority = "later";
    }
    const dueAt = resolveHeuristicDueDate(lower, today);
    return { index, priority, effortMinutes: null, dueAt, tag: null };
  });
}

/**
 * Locates a (possibly model-quoted) excerpt inside `rawText`, tolerant of whitespace
 * differences (a model routinely reflows/re-wraps a quoted line). Both sides are
 * normalized by collapsing every whitespace run to a single space before searching; the
 * match is then mapped back to the ORIGINAL, un-normalized offsets via a parallel index
 * map, so the returned `{ start, end }` slices `rawText` exactly, not the normalized
 * copy. Returns `null` when the quote isn't found — a hallucinated quote must yield no
 * anchor, never a wrong one.
 */
export function locateQuote(rawText: string, quote: string): { start: number; end: number } | null {
  const normalizedQuote = quote.trim().replace(/\s+/g, " ");
  if (normalizedQuote.length === 0) return null;

  const normalizedChars: string[] = [];
  // `normalizedChars[i]` came from `rawText[originalIndex[i]]` — lets us map a match
  // position in the normalized string back to the real offset in `rawText`.
  const originalIndex: number[] = [];
  let previousWasSpace = true; // collapses leading whitespace too, same as `.trim()`.

  for (let i = 0; i < rawText.length; i += 1) {
    const char = rawText[i]!;
    if (/\s/.test(char)) {
      if (!previousWasSpace) {
        normalizedChars.push(" ");
        originalIndex.push(i);
        previousWasSpace = true;
      }
    } else {
      normalizedChars.push(char);
      originalIndex.push(i);
      previousWasSpace = false;
    }
  }

  const normalizedText = normalizedChars.join("");
  const matchAt = normalizedText.indexOf(normalizedQuote);
  if (matchAt === -1) return null;

  const start = originalIndex[matchAt];
  const lastCharAt = originalIndex[matchAt + normalizedQuote.length - 1];
  if (start === undefined || lastCharAt === undefined) return null;

  return { start, end: lastCharAt + 1 };
}
