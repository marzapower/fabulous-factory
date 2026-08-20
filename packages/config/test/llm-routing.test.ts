import { describe, expect, it } from "vitest";

import {
  resolveDirectRoutingKey,
  resolveModel,
  TIER_ENV_KEY,
  type ModelsConfig,
  type Quality,
  type RoutingEnv,
} from "../src/llm-routing";

const NO_ENV: RoutingEnv = {};

// A synthetic, minimal table — this module is a pure leaf with no `models.json` of its
// own (plan G.3.2: `resolveModel`'s `models` parameter is REQUIRED here, unlike llm's
// wrapper), so every case supplies its own structural table rather than depending on
// packages/llm's shipped defaults (those stay covered by packages/llm/test/routing.test.ts).
const MODELS: ModelsConfig = {
  local: { cheap: "local-cheap", balanced: "local-balanced", high: "local-high" },
  openrouter: { cheap: "or-cheap", balanced: "or-balanced", high: "or-high" },
  "direct-anthropic": { cheap: "da-cheap", balanced: "da-balanced", high: "da-high" },
  "direct-openai": { cheap: "do-cheap", balanced: "do-balanced", high: "do-high" },
};

describe("resolveModel — profile × tier routing (structural)", () => {
  const cases: Array<{
    profile: "local" | "openrouter" | "direct";
    quality: Quality;
    env: RoutingEnv;
    expectedModel: string;
    expectedRoutingKey: string;
  }> = [
    {
      profile: "local",
      quality: "cheap",
      env: NO_ENV,
      expectedModel: "local-cheap",
      expectedRoutingKey: "local",
    },
    {
      profile: "local",
      quality: "balanced",
      env: NO_ENV,
      expectedModel: "local-balanced",
      expectedRoutingKey: "local",
    },
    {
      profile: "local",
      quality: "high",
      env: NO_ENV,
      expectedModel: "local-high",
      expectedRoutingKey: "local",
    },
    {
      profile: "openrouter",
      quality: "cheap",
      env: NO_ENV,
      expectedModel: "or-cheap",
      expectedRoutingKey: "openrouter",
    },
    {
      profile: "direct",
      quality: "cheap",
      env: { ANTHROPIC_API_KEY: "sk-ant-x" },
      expectedModel: "da-cheap",
      expectedRoutingKey: "direct-anthropic",
    },
    {
      profile: "direct",
      quality: "high",
      env: { OPENAI_API_KEY: "sk-x" },
      expectedModel: "do-high",
      expectedRoutingKey: "direct-openai",
    },
  ];

  for (const { profile, quality, env, expectedModel, expectedRoutingKey } of cases) {
    it(`routes ${profile}/${quality} → ${expectedRoutingKey}:${expectedModel}`, () => {
      expect(resolveModel(profile, quality, env, MODELS)).toEqual({
        model: expectedModel,
        routingKey: expectedRoutingKey,
      });
    });
  }
});

describe("resolveModel — direct sub-table selection", () => {
  it("picks direct-anthropic when ANTHROPIC_API_KEY is present alongside OPENAI_API_KEY", () => {
    const env: RoutingEnv = { ANTHROPIC_API_KEY: "sk-ant-x", OPENAI_API_KEY: "sk-x" };
    expect(resolveModel("direct", "balanced", env, MODELS).routingKey).toBe("direct-anthropic");
  });

  it("picks direct-openai when only OPENAI_API_KEY is present", () => {
    const env: RoutingEnv = { OPENAI_API_KEY: "sk-x" };
    expect(resolveModel("direct", "balanced", env, MODELS).routingKey).toBe("direct-openai");
  });

  it("picks direct-openai when neither key is present (no credentials to prefer anthropic with)", () => {
    expect(resolveModel("direct", "balanced", NO_ENV, MODELS).routingKey).toBe("direct-openai");
  });
});

describe("resolveDirectRoutingKey", () => {
  it("mirrors resolveModel's direct sub-table precedence directly", () => {
    expect(resolveDirectRoutingKey({ ANTHROPIC_API_KEY: "sk-ant-x" })).toBe("direct-anthropic");
    expect(resolveDirectRoutingKey({ OPENAI_API_KEY: "sk-x" })).toBe("direct-openai");
    expect(resolveDirectRoutingKey(NO_ENV)).toBe("direct-openai");
  });
});

describe("resolveModel — env overrides", () => {
  it("LLM_MODEL_CHEAP overrides the routed cheap-tier model", () => {
    const env: RoutingEnv = { LLM_MODEL_CHEAP: "custom-cheap-model" };
    expect(resolveModel("openrouter", "cheap", env, MODELS)).toEqual({
      model: "custom-cheap-model",
      routingKey: "openrouter",
    });
  });

  it("LLM_MODEL_BALANCED overrides only the balanced tier, not cheap/high", () => {
    const env: RoutingEnv = { LLM_MODEL_BALANCED: "custom-balanced-model" };
    expect(resolveModel("local", "balanced", env, MODELS).model).toBe("custom-balanced-model");
    expect(resolveModel("local", "cheap", env, MODELS).model).toBe("local-cheap");
    expect(resolveModel("local", "high", env, MODELS).model).toBe("local-high");
  });

  it("LLM_MODEL_HIGH overrides the routed high-tier model", () => {
    const env: RoutingEnv = { LLM_MODEL_HIGH: "custom-high-model", OPENAI_API_KEY: "sk-x" };
    expect(resolveModel("direct", "high", env, MODELS).model).toBe("custom-high-model");
  });

  it("an empty-string override does NOT replace the routed id", () => {
    const env: RoutingEnv = { LLM_MODEL_CHEAP: "" };
    expect(resolveModel("openrouter", "cheap", env, MODELS).model).toBe("or-cheap");
  });

  it("the override still reports the correct routingKey (direct sub-table pick unaffected)", () => {
    const env: RoutingEnv = {
      LLM_MODEL_CHEAP: "custom-cheap-model",
      ANTHROPIC_API_KEY: "sk-ant-x",
    };
    expect(resolveModel("direct", "cheap", env, MODELS)).toEqual({
      model: "custom-cheap-model",
      routingKey: "direct-anthropic",
    });
  });

  it("TIER_ENV_KEY maps each quality to its override env var name", () => {
    expect(TIER_ENV_KEY).toEqual({
      cheap: "LLM_MODEL_CHEAP",
      balanced: "LLM_MODEL_BALANCED",
      high: "LLM_MODEL_HIGH",
    });
  });
});

describe("resolveModel — custom models table", () => {
  it("reads from any caller-supplied ModelsConfig", () => {
    const models: ModelsConfig = {
      local: { cheap: "a", balanced: "b", high: "c" },
      openrouter: { cheap: "d", balanced: "e", high: "f" },
      "direct-anthropic": { cheap: "g", balanced: "h", high: "i" },
      "direct-openai": { cheap: "j", balanced: "k", high: "l" },
    };
    expect(resolveModel("local", "high", NO_ENV, models).model).toBe("c");
  });
});
