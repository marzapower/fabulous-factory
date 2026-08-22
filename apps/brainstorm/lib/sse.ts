/**
 * Client-side SSE frame parser for `POST /api/chat` (plan K.8.4). Deliberately pure and
 * side-effect free — no `fetch`, no DOM, nothing that can't run under `apps/web/test/`'s
 * node environment (`apps/web/vitest.config.ts` has no DOM), which is exactly why this
 * logic lives here instead of inline in the React reader loop: it is the only part of
 * the transport that can be unit-tested at all.
 *
 * The server (`apps/web/app/api/chat/route.ts`) writes one frame per event as
 * `data: ${JSON.stringify(event)}\n\n` — a single `data:` line, terminated by a blank
 * line. This parser makes no assumption that a frame arrives whole in one `fetch` chunk:
 * a chunk boundary can land anywhere, including mid-frame or mid-line, so everything not
 * yet resolved into a complete frame is held in an internal buffer across calls.
 */

/**
 * Returns a stateful parser function: call it once per chunk read off the response body,
 * in order. Each call returns the (possibly empty) list of complete JSON frames that
 * chunk completed, having consumed and folded in whatever partial frame was left over
 * from the previous call.
 *
 * - A frame split across two (or more) chunk boundaries is buffered until the
 *   terminating blank line (`\n\n`) actually arrives.
 * - Several complete frames in one chunk are all returned, in order.
 * - A trailing partial frame (no terminating blank line yet) is held, not returned.
 * - A blank keep-alive frame (no `data:` line inside it) yields nothing — not an error,
 *   not a malformed-frame warning, just silently skipped.
 * - A `data:` line whose payload fails to parse as JSON is dropped rather than thrown —
 *   one malformed frame must never kill the reader loop for every frame after it.
 */
export function createSseFrameParser(): (chunk: string) => object[] {
  let buffer = "";

  return (chunk: string): object[] => {
    buffer += chunk;

    const frames: object[] = [];
    let separatorIndex: number;
    // Frames are delimited by a blank line. Everything after the last complete
    // delimiter stays in `buffer` for the next call — including an empty remainder.
    while ((separatorIndex = buffer.indexOf("\n\n")) !== -1) {
      const rawFrame = buffer.slice(0, separatorIndex);
      buffer = buffer.slice(separatorIndex + 2);

      const dataLines = rawFrame
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice("data:".length).trimStart());

      if (dataLines.length === 0) {
        // Blank line, or a comment-only keep-alive frame — nothing to parse.
        continue;
      }

      const payload = dataLines.join("\n");
      try {
        frames.push(JSON.parse(payload) as object);
      } catch {
        // Malformed frame — dropped, not thrown. The reader loop must survive one bad
        // frame; a throw here would kill the stream for every event after it.
      }
    }

    return frames;
  };
}
