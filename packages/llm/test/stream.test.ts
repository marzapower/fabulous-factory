import { convertArrayToReadableStream, MockLanguageModelV4 } from "ai/test";
import type { LanguageModelV4StreamPart } from "@ai-sdk/provider";
import { z } from "zod";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ResolvedModel } from "../src/profile";

// Same mocking strategy as `generate.test.ts` (see its header comment): `./profile` and
// `./record` are mocked by module path so `call.ts` — which `streamArray` shares with
// `generate` — must import them directly (plan K.14 R3). The model itself is a real
// `MockLanguageModelV4` (`ai/test`) driving a real `streamText`, so the AI SDK's own
// `Output.array` parsing runs unmocked, end to end.
vi.mock("../src/profile", () => ({
  resolveLanguageModel: vi.fn(),
}));
vi.mock("../src/record", () => ({
  recordLlmCall: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@factory/observability", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@factory/observability")>();
  return { ...actual, captureException: vi.fn() };
});

import { captureException } from "@factory/observability";
import { resolveLanguageModel } from "../src/profile";
import { recordLlmCall } from "../src/record";
import { streamArray } from "../src/stream";
import { LlmBudgetExceededError } from "../src/errors";

const mockedResolve = vi.mocked(resolveLanguageModel);
const mockedRecord = vi.mocked(recordLlmCall);
const mockedCaptureException = vi.mocked(captureException);

function resolvedWith(
  overrides: Partial<ResolvedModel> & { model: ResolvedModel["model"] },
): ResolvedModel {
  return {
    modelId: "claude-haiku-4-5",
    profile: "direct",
    routingKey: "direct-anthropic",
    ...overrides,
  };
}

/** Builds a stream over the low-level parts real providers emit (F.10.9 pattern). */
function streamModel(
  parts: LanguageModelV4StreamPart[],
  opts: { errorAfter?: boolean } = {},
): MockLanguageModelV4 {
  return new MockLanguageModelV4({
    doStream: async () => ({
      stream: opts.errorAfter
        ? new ReadableStream<LanguageModelV4StreamPart>({
            async start(controller) {
              for (const part of parts) controller.enqueue(part);
              // Yield to the event loop so the downstream transforms/reader actually
              // drain the already-enqueued parts before the stream errors — erroring in
              // the same tick discards the ReadableStream's internal queue per spec,
              // which would make this indistinguishable from an immediate failure.
              await new Promise((resolve) => setTimeout(resolve, 0));
              controller.error(new Error("connection dropped"));
            },
          })
        : convertArrayToReadableStream(parts),
    }),
  });
}

const usagePart: LanguageModelV4StreamPart = {
  type: "finish",
  finishReason: { unified: "stop", raw: "stop" },
  usage: {
    inputTokens: { total: 40, noCache: 40, cacheRead: undefined, cacheWrite: undefined },
    outputTokens: { total: 20, text: 20, reasoning: undefined },
  },
};

function textParts(json: string): LanguageModelV4StreamPart[] {
  return [
    { type: "stream-start", warnings: [] },
    { type: "text-start", id: "1" },
    { type: "text-delta", id: "1", delta: json },
    { type: "text-end", id: "1" },
  ];
}

const elementSchema = z.object({ title: z.string() });

beforeEach(() => {
  mockedResolve.mockReset();
  mockedRecord.mockReset();
  mockedRecord.mockResolvedValue(undefined);
  mockedCaptureException.mockReset();
});

describe("streamArray — success path", () => {
  it("invokes onElement in arrival order with the right indices and resolves with the delivered array", async () => {
    const json = JSON.stringify({ elements: [{ title: "first" }, { title: "second" }] });
    const model = streamModel([...textParts(json), usagePart]);
    mockedResolve.mockResolvedValue(resolvedWith({ model }));

    const seen: Array<{ element: { title: string }; index: number }> = [];
    const result = await streamArray({
      task: "extract",
      element: elementSchema,
      onElement: (element, index) => seen.push({ element, index }),
    });

    expect(seen).toEqual([
      { element: { title: "first" }, index: 0 },
      { element: { title: "second" }, index: 1 },
    ]);
    expect(result.output).toEqual([{ title: "first" }, { title: "second" }]);
    expect(result.usage).toEqual({ inputTokens: 40, outputTokens: 20 });

    expect(mockedRecord).toHaveBeenCalledTimes(1);
    expect(mockedRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        profile: "direct",
        model: "claude-haiku-4-5",
        inputTokens: 40,
        outputTokens: 20,
        ok: true,
        errorCode: null,
      }),
    );
  });

  it("drops an element that fails schema validation mid-stream without aborting the call (M4)", async () => {
    const json = JSON.stringify({
      elements: [{ title: "ok-one" }, { title: 42 }, { title: "ok-two" }],
    });
    const model = streamModel([...textParts(json), usagePart]);
    mockedResolve.mockResolvedValue(resolvedWith({ model }));

    const onElement = vi.fn();
    const result = await streamArray({ task: "extract", element: elementSchema, onElement });

    expect(result.output).toEqual([{ title: "ok-one" }, { title: "ok-two" }]);
    expect(onElement).toHaveBeenCalledTimes(2);
    expect(onElement).toHaveBeenNthCalledWith(1, { title: "ok-one" }, 0);
    expect(onElement).toHaveBeenNthCalledWith(2, { title: "ok-two" }, 1);
    expect(mockedRecord).toHaveBeenCalledWith(expect.objectContaining({ ok: true }));
  });

  it("catches, logs, and does not fail the call when onElement throws", async () => {
    const json = JSON.stringify({ elements: [{ title: "first" }, { title: "second" }] });
    const model = streamModel([...textParts(json), usagePart]);
    mockedResolve.mockResolvedValue(resolvedWith({ model }));

    const onElement = vi.fn((_element: { title: string }, index: number) => {
      if (index === 0) throw new Error("callback exploded");
    });

    const result = await streamArray({ task: "extract", element: elementSchema, onElement });

    expect(result.output).toEqual([{ title: "first" }, { title: "second" }]);
    expect(mockedCaptureException).toHaveBeenCalledTimes(1);
    expect(mockedRecord).toHaveBeenCalledWith(expect.objectContaining({ ok: true }));
  });
});

describe("streamArray — mid-stream failure", () => {
  it("records a failed llm_calls row and rethrows when the stream errors after partial delivery", async () => {
    const json = JSON.stringify({ elements: [{ title: "first" }, { title: "second" }] });
    const model = streamModel(textParts(json), { errorAfter: true });
    mockedResolve.mockResolvedValue(resolvedWith({ model }));

    const onElement = vi.fn();
    await expect(
      streamArray({ task: "extract", element: elementSchema, onElement }),
    ).rejects.toThrow("connection dropped");

    expect(onElement).toHaveBeenCalledTimes(2);
    expect(mockedRecord).toHaveBeenCalledTimes(1);
    expect(mockedRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        ok: false,
        inputTokens: null,
        outputTokens: null,
        costCents: null,
        costSource: "unknown",
      }),
    );
  });
});

describe("streamArray — pre-call guards", () => {
  it("throws LlmDisabledError before any provider call when the profile rejects with it", async () => {
    class FakeLlmDisabledError extends Error {}
    mockedResolve.mockRejectedValue(new FakeLlmDisabledError());

    await expect(streamArray({ task: "extract", element: elementSchema })).rejects.toBeInstanceOf(
      FakeLlmDisabledError,
    );

    expect(mockedRecord).not.toHaveBeenCalled();
  });

  it("throws LlmBudgetExceededError from the pre-check before calling the model or recording anything", async () => {
    const doStream = vi.fn();
    const model = new MockLanguageModelV4({ doStream });
    // claude-opus-5: $5/$25 per 1M tokens — a tiny maxCostCents guarantees refusal.
    mockedResolve.mockResolvedValue(resolvedWith({ model, modelId: "claude-opus-5" }));

    await expect(
      streamArray({
        task: "expensive extraction",
        element: elementSchema,
        maxCostCents: 0.0001,
      }),
    ).rejects.toBeInstanceOf(LlmBudgetExceededError);

    expect(doStream).not.toHaveBeenCalled();
    expect(mockedRecord).not.toHaveBeenCalled();
  });
});
