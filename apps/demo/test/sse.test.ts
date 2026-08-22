import { describe, expect, it } from "vitest";

import { createSseFrameParser } from "../lib/sse";

function frame(payload: unknown): string {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

describe("createSseFrameParser", () => {
  it("parses a single complete frame delivered in one chunk", () => {
    const parse = createSseFrameParser();
    const result = parse(frame({ type: "run-started", runId: "r1" }));
    expect(result).toEqual([{ type: "run-started", runId: "r1" }]);
  });

  it("parses several frames delivered in one chunk, in order", () => {
    const parse = createSseFrameParser();
    const chunk = frame({ type: "a" }) + frame({ type: "b" }) + frame({ type: "c" });
    const result = parse(chunk);
    expect(result).toEqual([{ type: "a" }, { type: "b" }, { type: "c" }]);
  });

  it("buffers a frame split across a chunk boundary until it completes", () => {
    const parse = createSseFrameParser();
    const whole = frame({ type: "step", key: "extract" });
    const splitAt = Math.floor(whole.length / 2);

    const first = parse(whole.slice(0, splitAt));
    expect(first).toEqual([]);

    const second = parse(whole.slice(splitAt));
    expect(second).toEqual([{ type: "step", key: "extract" }]);
  });

  it("holds a trailing partial frame until a later chunk completes it", () => {
    const parse = createSseFrameParser();
    const complete = frame({ type: "task-added", id: "t1" });
    const partial = 'data: {"type":"task-tria';

    const result = parse(complete + partial);
    expect(result).toEqual([{ type: "task-added", id: "t1" }]);

    const followUp = parse('ged","id":"t1"}\n\n');
    expect(followUp).toEqual([{ type: "task-triaged", id: "t1" }]);
  });

  it("ignores blank keep-alive lines without emitting a frame", () => {
    const parse = createSseFrameParser();
    const result = parse("\n\n" + frame({ type: "run-finished" }));
    expect(result).toEqual([{ type: "run-finished" }]);
  });

  it("drops a malformed frame instead of throwing, and keeps parsing later ones", () => {
    const parse = createSseFrameParser();
    const malformed = "data: not-json\n\n";
    const result = parse(malformed + frame({ type: "ok" }));
    expect(result).toEqual([{ type: "ok" }]);
  });

  it("handles many chunk boundaries across a realistic event sequence", () => {
    const parse = createSseFrameParser();
    const events = [
      { type: "run-started", runId: "r1" },
      { type: "step", key: "extract", status: "running" },
      { type: "data", payload: { kind: "task-added", id: "t1" } },
      { type: "step", key: "extract", status: "succeeded" },
      { type: "run-finished", runId: "r1", status: "succeeded" },
    ];
    const wire = events.map(frame).join("");

    // Feed the wire content through in small, arbitrary-width chunks.
    const chunkSize = 7;
    const collected: object[] = [];
    for (let i = 0; i < wire.length; i += chunkSize) {
      collected.push(...parse(wire.slice(i, i + chunkSize)));
    }

    expect(collected).toEqual(events);
  });
});
