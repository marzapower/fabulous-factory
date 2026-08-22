/**
 * Pure segmentation logic for "the consuming dump" — deliberately a `.ts` module rather
 * than living inside `dump-panel.tsx`. The repo's vitest setup does not parse `.tsx`
 * (every existing test under `apps/web/test/` imports plain `.ts`: `run-reducer.ts`,
 * `format.ts`, `sse.ts`), so logic worth testing has to sit outside the component. Both
 * functions here are worth testing: between them they decide which of the user's own
 * words are shown as consumed and what source range a manually-added task records.
 */
export interface DumpTaskSpan {
  id: string;
  title: string;
  sourceStart: number | null;
  sourceEnd: number | null;
}

export interface Segment {
  start: number;
  end: number;
  taskId: string | null;
}

/** Non-overlapping, sorted segments across `text`: a segment with `taskId` is
 * "consumed" (some task claims that span); `taskId: null` is a "leftover" the model
 * (or the heuristic) never touched. Spans are trusted to be non-overlapping by
 * construction (each comes from one task's own extraction), but sorted defensively
 * since arrival order over SSE is index order, not source-offset order. */
export function buildSegments(text: string, tasks: DumpTaskSpan[]): Segment[] {
  const spans = tasks
    .filter(
      (t): t is DumpTaskSpan & { sourceStart: number; sourceEnd: number } =>
        t.sourceStart !== null && t.sourceEnd !== null && t.sourceEnd > t.sourceStart,
    )
    .map((t) => ({ start: t.sourceStart, end: t.sourceEnd, taskId: t.id }))
    .sort((a, b) => a.start - b.start);

  const segments: Segment[] = [];
  let cursor = 0;
  for (const span of spans) {
    const start = Math.max(span.start, cursor);
    if (start >= span.end) continue; // Fully overlapped by a prior span — dropped.
    if (start > cursor) segments.push({ start: cursor, end: start, taskId: null });
    segments.push({ start, end: span.end, taskId: span.taskId });
    cursor = span.end;
  }
  if (cursor < text.length) segments.push({ start: cursor, end: text.length, taskId: null });
  return segments;
}

export interface LeftoverPiece {
  text: string;
  /** Absolute offsets into the dump text; `null` for a piece that is only whitespace. */
  span: { start: number; end: number } | null;
}

/**
 * Breaks one leftover segment into pieces so that NO newline ever lands inside a
 * `<button>`, and each clickable piece is exactly one line's worth of words.
 *
 * A `<button>` is `inline-block`, which opens its own inline formatting context: a
 * newline inside one cannot break the PARENT's line. Rendering a leftover as a single
 * button therefore welded lines together — "…they've pinged twice⏎book the flight…"
 * came out as "…pinged twicebook the flight…". Splitting only the segment's outer edges
 * fixed the common case but not the real one: whenever the model skips two consecutive
 * lines they arrive as ONE leftover segment with a newline in the middle, which is the
 * normal shape of "what the model ignored".
 *
 * Splitting per line also makes the affordance mean what it says — clicking adds THAT
 * line as a task, not a two-line blob — and keeps the click target and `aria-label` off
 * the surrounding whitespace.
 */
export function splitLeftover(raw: string, start: number): LeftoverPiece[] {
  const pieces: LeftoverPiece[] = [];
  let offset = 0;

  raw.split("\n").forEach((line, index) => {
    if (index > 0) {
      pieces.push({ text: "\n", span: null });
      offset += 1;
    }
    const lead = line.slice(0, line.length - line.trimStart().length);
    const tail = line.slice(line.trimEnd().length);
    const core = line.slice(lead.length, line.length - tail.length);

    // A line with no words at all is emitted ONCE, verbatim. Falling through would
    // duplicate it: for "   " both `trimStart()` and `trimEnd()` are empty, so `lead`
    // and `tail` are each the whole line and the user's own note would come back with
    // the indentation doubled.
    if (!core) {
      if (line) pieces.push({ text: line, span: null });
      offset += line.length;
      return;
    }

    if (lead) pieces.push({ text: lead, span: null });
    const coreStart = start + offset + lead.length;
    pieces.push({ text: core, span: { start: coreStart, end: coreStart + core.length } });
    if (tail) pieces.push({ text: tail, span: null });
    offset += line.length;
  });

  return pieces;
}
