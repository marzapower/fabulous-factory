import type { Capabilities, Env } from "@factory/config";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Module-registry check (plan F.2.3/F.6, same idiom as packages/email/test/send.test.ts):
// tracks whether any of the four provider SDKs was ever imported. Runs `generate.ts`
// (and therefore the REAL `profile.ts`) unmocked against a stubbed `@factory/config`, so
// this exercises the actual `resolveLanguageModel` disabled-path short-circuit, not a
// mock of it.
const providerState = vi.hoisted(() => ({
  openaiCompatibleImported: false,
  openrouterImported: false,
  anthropicImported: false,
  openaiImported: false,
}));

vi.mock("@ai-sdk/openai-compatible", () => {
  providerState.openaiCompatibleImported = true;
  return { createOpenAICompatible: vi.fn() };
});
vi.mock("@openrouter/ai-sdk-provider", () => {
  providerState.openrouterImported = true;
  return { createOpenRouter: vi.fn() };
});
vi.mock("@ai-sdk/anthropic", () => {
  providerState.anthropicImported = true;
  return { createAnthropic: vi.fn() };
});
vi.mock("@ai-sdk/openai", () => {
  providerState.openaiImported = true;
  return { createOpenAI: vi.fn() };
});

vi.mock("@factory/config", () => ({
  getCapabilities: vi.fn(),
  getEnv: vi.fn(),
}));

// `recordLlmCall` would never be reached on the disabled path (it's thrown before the
// span even opens), but mocking it keeps this test from needing a real database should
// that invariant ever regress silently instead of loudly.
vi.mock("../src/record", () => ({
  recordLlmCall: vi.fn().mockResolvedValue(undefined),
}));

import { getCapabilities, getEnv } from "@factory/config";

import { generate } from "../src/generate";
import { LlmDisabledError } from "../src/errors";
import { recordLlmCall } from "../src/record";

const mockedGetCapabilities = vi.mocked(getCapabilities);
const mockedGetEnv = vi.mocked(getEnv);
const mockedRecord = vi.mocked(recordLlmCall);

const DISABLED_CAPABILITIES: Capabilities = {
  billing: "disabled",
  llm: "disabled",
  email: "disabled",
  jobs: "disabled",
  analytics: "disabled",
  errors: "disabled",
};

beforeEach(() => {
  mockedGetCapabilities.mockReset();
  mockedGetEnv.mockReset();
  mockedRecord.mockReset();
  providerState.openaiCompatibleImported = false;
  providerState.openrouterImported = false;
  providerState.anthropicImported = false;
  providerState.openaiImported = false;
});

describe("generate — llm capability disabled", () => {
  it("rejects with LlmDisabledError and loads no provider SDK at all", async () => {
    mockedGetCapabilities.mockReturnValue(DISABLED_CAPABILITIES);
    mockedGetEnv.mockReturnValue({} as Env);

    await expect(generate({ task: "hello" })).rejects.toBeInstanceOf(LlmDisabledError);

    expect(providerState.openaiCompatibleImported).toBe(false);
    expect(providerState.openrouterImported).toBe(false);
    expect(providerState.anthropicImported).toBe(false);
    expect(providerState.openaiImported).toBe(false);
    expect(mockedRecord).not.toHaveBeenCalled();
  });
});
