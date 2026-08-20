import { describe, expect, it } from "vitest";

import { tracer } from "../src/tracing";

describe("tracer", () => {
  it("is a genuine OTel no-op tracer with no provider registered", () => {
    // No SDK is installed anywhere in this package/test — trace.getTracer("factory")
    // must resolve to the @opentelemetry/api default NoopTracer.
    let ran = false;
    let sawSpan: unknown;

    const result = tracer.startActiveSpan("test-span", (span) => {
      ran = true;
      sawSpan = span;
      span.end();
      return "callback-return-value";
    });

    // The callback still runs synchronously and its return value is forwarded — this is
    // what makes the seam safe to call unconditionally before any provider exists.
    expect(ran).toBe(true);
    expect(result).toBe("callback-return-value");

    // But the span itself is a NonRecordingSpan: no data is captured or exported.
    expect(sawSpan).toBeDefined();
    expect((sawSpan as { isRecording(): boolean }).isRecording()).toBe(false);
  });

  it("startSpan also returns a non-recording span", () => {
    const span = tracer.startSpan("manual-span");
    expect(span.isRecording()).toBe(false);
    span.end();
  });
});
