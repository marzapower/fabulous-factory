import { APICallError } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { z } from "zod";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ResolvedModel } from "../src/profile";

// `generate.ts` is tested against a mocked `./profile` (F.6/F.10: profile resolution is
// its own concern, exercised for real by `test/disabled.test.ts`) and a mocked
// `./record` (so every test can assert exactly what got written to `llm_calls` without a
// real database). The model itself is a real `MockLanguageModelV4` (`ai/test`, F.10.9) so
// `generateText` runs its real logic end to end against a scripted provider response.
vi.mock("../src/profile", () => ({
  resolveLanguageModel: vi.fn(),
}));
vi.mock("../src/record", () => ({
  recordLlmCall: vi.fn().mockResolvedValue(undefined),
}));

import { resolveLanguageModel } from "../src/profile";
import { recordLlmCall } from "../src/record";
import { generate } from "../src/generate";
import { LlmBudgetExceededError } from "../src/errors";

const mockedResolve = vi.mocked(resolveLanguageModel);
const mockedRecord = vi.mocked(recordLlmCall);

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

beforeEach(() => {
  mockedResolve.mockReset();
  mockedRecord.mockReset();
  mockedRecord.mockResolvedValue(undefined);
});

describe("generate — success path", () => {
  it("returns a full envelope with usage→cost math off real pricing.json entries", async () => {
    const doGenerate = vi.fn().mockResolvedValue({
      content: [{ type: "text", text: "Hello world" }],
      finishReason: { unified: "stop", raw: "stop" },
      usage: {
        inputTokens: { total: 300, noCache: 300, cacheRead: undefined, cacheWrite: undefined },
        outputTokens: { total: 150, text: 150, reasoning: undefined },
      },
      warnings: [],
    });
    const model = new MockLanguageModelV4({ doGenerate });
    mockedResolve.mockResolvedValue(
      resolvedWith({ model, modelId: "claude-haiku-4-5", profile: "direct" }),
    );

    const result = await generate({ task: "say hello", promptId: "greeting" });

    expect(doGenerate).toHaveBeenCalledTimes(1);
    expect(result.output).toBe("Hello world");
    expect(result.model).toBe("claude-haiku-4-5");
    expect(result.profile).toBe("direct");
    expect(result.usage).toEqual({ inputTokens: 300, outputTokens: 150 });
    // pricing.json: claude-haiku-4-5 = $1/$5 per 1M tokens.
    // (300 * 1 + 150 * 5) / 1_000_000 * 100 = 0.105 cents.
    expect(result.costCents).toBeCloseTo(0.105, 10);
    expect(result.costSource).toBe("estimated");
    expect(typeof result.latencyMs).toBe("number");
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);

    expect(mockedRecord).toHaveBeenCalledTimes(1);
    expect(mockedRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        promptId: "greeting",
        profile: "direct",
        model: "claude-haiku-4-5",
        quality: "balanced",
        inputTokens: 300,
        outputTokens: 150,
        costSource: "estimated",
        ok: true,
        errorCode: null,
      }),
    );
  });

  it("defaults costCents to 0 with source 'estimated' on the local profile, never consulting pricing.json", async () => {
    const doGenerate = vi.fn().mockResolvedValue({
      content: [{ type: "text", text: "local reply" }],
      finishReason: { unified: "stop", raw: "stop" },
      usage: {
        inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
        outputTokens: { total: 5, text: 5, reasoning: undefined },
      },
      warnings: [],
    });
    const model = new MockLanguageModelV4({ doGenerate });
    mockedResolve.mockResolvedValue(
      resolvedWith({ model, modelId: "llama3.2", profile: "local", routingKey: "local" }),
    );

    const result = await generate({ task: "hi" });

    expect(result.costCents).toBe(0);
    expect(result.costSource).toBe("estimated");
  });
});

describe("generate — schema path", () => {
  it("returns the schema-parsed object as `output`", async () => {
    const schema = z.object({ answer: z.string() });
    const doGenerate = vi.fn().mockResolvedValue({
      content: [{ type: "text", text: JSON.stringify({ answer: "42" }) }],
      finishReason: { unified: "stop", raw: "stop" },
      usage: {
        inputTokens: { total: 20, noCache: 20, cacheRead: undefined, cacheWrite: undefined },
        outputTokens: { total: 8, text: 8, reasoning: undefined },
      },
      warnings: [],
    });
    const model = new MockLanguageModelV4({ doGenerate });
    mockedResolve.mockResolvedValue(
      resolvedWith({ model, modelId: "claude-haiku-4-5", profile: "direct" }),
    );

    const result = await generate({ task: "answer", schema });

    expect(result.output).toEqual({ answer: "42" });
  });
});

describe("generate — provider error", () => {
  it("records ok=false with the detected error code and rethrows the original error", async () => {
    const providerError = new APICallError({
      message: "upstream failure",
      url: "https://example.test/v1/messages",
      requestBodyValues: {},
      statusCode: 500,
      isRetryable: false,
    });
    const doGenerate = vi.fn().mockRejectedValue(providerError);
    const model = new MockLanguageModelV4({ doGenerate });
    mockedResolve.mockResolvedValue(
      resolvedWith({ model, modelId: "claude-haiku-4-5", profile: "direct" }),
    );

    await expect(generate({ task: "fail please" })).rejects.toBe(providerError);

    expect(mockedRecord).toHaveBeenCalledTimes(1);
    expect(mockedRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        ok: false,
        errorCode: "APICallError",
        inputTokens: null,
        outputTokens: null,
        costCents: null,
        costSource: "unknown",
      }),
    );
  });
});

describe("generate — budget pre-check", () => {
  it("refuses a KNOWN model over maxCostCents before calling the model or recording anything", async () => {
    const doGenerate = vi.fn();
    const model = new MockLanguageModelV4({ doGenerate });
    // claude-opus-5: $5/$25 per 1M tokens — a tiny maxCostCents guarantees refusal.
    mockedResolve.mockResolvedValue(
      resolvedWith({
        model,
        modelId: "claude-opus-5",
        profile: "direct",
        routingKey: "direct-anthropic",
      }),
    );

    await expect(generate({ task: "expensive task", maxCostCents: 0.0001 })).rejects.toBeInstanceOf(
      LlmBudgetExceededError,
    );

    expect(doGenerate).not.toHaveBeenCalled();
    expect(mockedRecord).not.toHaveBeenCalled();
  });

  it("allows the call through when the model is unknown to pricing.json, even with maxCostCents set", async () => {
    const doGenerate = vi.fn().mockResolvedValue({
      content: [{ type: "text", text: "ok" }],
      finishReason: { unified: "stop", raw: "stop" },
      usage: {
        inputTokens: { total: 5, noCache: 5, cacheRead: undefined, cacheWrite: undefined },
        outputTokens: { total: 5, text: 5, reasoning: undefined },
      },
      warnings: [],
    });
    const model = new MockLanguageModelV4({ doGenerate });
    mockedResolve.mockResolvedValue(
      resolvedWith({
        model,
        modelId: "totally-unpriced-model",
        profile: "direct",
        routingKey: "direct-anthropic",
      }),
    );

    const result = await generate({ task: "cheap-looking but unpriced", maxCostCents: 1 });

    expect(doGenerate).toHaveBeenCalledTimes(1);
    expect(result.costCents).toBeNull();
    expect(result.costSource).toBe("unknown");
  });

  it("enforces the budget's output-token assumption as the generation cap (review fix)", async () => {
    const doGenerate = vi.fn().mockResolvedValue({
      content: [{ type: "text", text: "capped" }],
      finishReason: { unified: "stop", raw: "stop" },
      usage: {
        inputTokens: { total: 5, noCache: 5, cacheRead: undefined, cacheWrite: undefined },
        outputTokens: { total: 5, text: 5, reasoning: undefined },
      },
      warnings: [],
    });
    const model = new MockLanguageModelV4({ doGenerate });
    mockedResolve.mockResolvedValue(
      resolvedWith({
        model,
        modelId: "claude-haiku-4-5",
        profile: "direct",
        routingKey: "direct-anthropic",
      }),
    );

    // maxCostCents set, maxOutputTokens NOT set → the 1024-token estimate the budget was
    // checked against must reach the model as an enforced maxOutputTokens cap.
    await generate({ task: "short", maxCostCents: 50 });
    expect(doGenerate.mock.calls[0][0].maxOutputTokens).toBe(1024);

    // No budget → the caller's absent maxOutputTokens passes through untouched.
    await generate({ task: "short" });
    expect(doGenerate.mock.calls[1][0].maxOutputTokens).toBeUndefined();
  });
});

describe("generate — openrouter reported cost", () => {
  it("prefers the provider-reported cost over a pricing.json estimate", async () => {
    const doGenerate = vi.fn().mockResolvedValue({
      content: [{ type: "text", text: "routed reply" }],
      finishReason: { unified: "stop", raw: "stop" },
      usage: {
        inputTokens: { total: 300, noCache: 300, cacheRead: undefined, cacheWrite: undefined },
        outputTokens: { total: 150, text: 150, reasoning: undefined },
      },
      providerMetadata: { openrouter: { usage: { cost: 0.0025 } } },
      warnings: [],
    });
    const model = new MockLanguageModelV4({ doGenerate });
    mockedResolve.mockResolvedValue(
      resolvedWith({
        model,
        modelId: "anthropic/claude-haiku-4.5",
        profile: "openrouter",
        routingKey: "openrouter",
      }),
    );

    const result = await generate({ task: "hi via openrouter" });

    expect(result.costCents).toBeCloseTo(0.25, 10);
    expect(result.costSource).toBe("reported");
  });
});
