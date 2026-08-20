import { describe, expect, it } from "vitest";

import {
  DEFAULT_MODELS,
  resolveModel,
  type ModelsConfig,
  type Quality,
  type RoutingEnv,
} from "../src/routing";

const NO_ENV: RoutingEnv = {};

describe("resolveModel — profile × tier routing against models.json defaults", () => {
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
      expectedModel: "llama3.2",
      expectedRoutingKey: "local",
    },
    {
      profile: "local",
      quality: "balanced",
      env: NO_ENV,
      expectedModel: "llama3.2",
      expectedRoutingKey: "local",
    },
    {
      profile: "local",
      quality: "high",
      env: NO_ENV,
      expectedModel: "llama3.2",
      expectedRoutingKey: "local",
    },
    {
      profile: "openrouter",
      quality: "cheap",
      env: NO_ENV,
      expectedModel: "anthropic/claude-haiku-4.5",
      expectedRoutingKey: "openrouter",
    },
    {
      profile: "openrouter",
      quality: "balanced",
      env: NO_ENV,
      expectedModel: "anthropic/claude-sonnet-4.6",
      expectedRoutingKey: "openrouter",
    },
    {
      profile: "openrouter",
      quality: "high",
      env: NO_ENV,
      expectedModel: "anthropic/claude-opus-5",
      expectedRoutingKey: "openrouter",
    },
    {
      profile: "direct",
      quality: "cheap",
      env: { ANTHROPIC_API_KEY: "sk-ant-x" },
      expectedModel: "claude-haiku-4-5",
      expectedRoutingKey: "direct-anthropic",
    },
    {
      profile: "direct",
      quality: "balanced",
      env: { ANTHROPIC_API_KEY: "sk-ant-x" },
      expectedModel: "claude-sonnet-4-6",
      expectedRoutingKey: "direct-anthropic",
    },
    {
      profile: "direct",
      quality: "high",
      env: { OPENAI_API_KEY: "sk-x" },
      expectedModel: "gpt-5.6-sol",
      expectedRoutingKey: "direct-openai",
    },
  ];

  for (const { profile, quality, env, expectedModel, expectedRoutingKey } of cases) {
    it(`routes ${profile}/${quality} → ${expectedRoutingKey}:${expectedModel}`, () => {
      expect(resolveModel(profile, quality, env)).toEqual({
        model: expectedModel,
        routingKey: expectedRoutingKey,
      });
    });
  }
});

describe("resolveModel — direct sub-table selection", () => {
  it("picks direct-anthropic when ANTHROPIC_API_KEY is present alongside OPENAI_API_KEY", () => {
    const env: RoutingEnv = { ANTHROPIC_API_KEY: "sk-ant-x", OPENAI_API_KEY: "sk-x" };
    expect(resolveModel("direct", "balanced", env).routingKey).toBe("direct-anthropic");
  });

  it("picks direct-openai when only OPENAI_API_KEY is present", () => {
    const env: RoutingEnv = { OPENAI_API_KEY: "sk-x" };
    expect(resolveModel("direct", "balanced", env).routingKey).toBe("direct-openai");
  });

  it("picks direct-openai when neither key is present (no credentials to prefer anthropic with)", () => {
    expect(resolveModel("direct", "balanced", NO_ENV).routingKey).toBe("direct-openai");
  });
});

describe("resolveModel — env overrides", () => {
  it("LLM_MODEL_CHEAP overrides the routed cheap-tier model", () => {
    const env: RoutingEnv = { LLM_MODEL_CHEAP: "custom-cheap-model" };
    expect(resolveModel("openrouter", "cheap", env)).toEqual({
      model: "custom-cheap-model",
      routingKey: "openrouter",
    });
  });

  it("LLM_MODEL_BALANCED overrides only the balanced tier, not cheap/high", () => {
    const env: RoutingEnv = { LLM_MODEL_BALANCED: "custom-balanced-model" };
    expect(resolveModel("local", "balanced", env).model).toBe("custom-balanced-model");
    expect(resolveModel("local", "cheap", env).model).toBe("llama3.2");
    expect(resolveModel("local", "high", env).model).toBe("llama3.2");
  });

  it("LLM_MODEL_HIGH overrides the routed high-tier model", () => {
    const env: RoutingEnv = { LLM_MODEL_HIGH: "custom-high-model" };
    expect(resolveModel("direct", "high", { ...env, OPENAI_API_KEY: "sk-x" }).model).toBe(
      "custom-high-model",
    );
  });

  it("an empty-string override does NOT replace the routed id", () => {
    const env: RoutingEnv = { LLM_MODEL_CHEAP: "" };
    expect(resolveModel("openrouter", "cheap", env).model).toBe("anthropic/claude-haiku-4.5");
  });

  it("the override still reports the correct routingKey (direct sub-table pick unaffected)", () => {
    const env: RoutingEnv = {
      LLM_MODEL_CHEAP: "custom-cheap-model",
      ANTHROPIC_API_KEY: "sk-ant-x",
    };
    expect(resolveModel("direct", "cheap", env)).toEqual({
      model: "custom-cheap-model",
      routingKey: "direct-anthropic",
    });
  });
});

describe("resolveModel — custom models table (llm's optional-models wrapper param)", () => {
  it("reads from a caller-supplied ModelsConfig instead of DEFAULT_MODELS", () => {
    // Structural coverage of resolveModel's own custom-table behavior lives in
    // packages/config/test/llm-routing.test.ts (plan G.3.2) — this case stays here
    // specifically to prove llm's thin wrapper still forwards an explicit `models`
    // argument instead of always falling back to DEFAULT_MODELS.
    const models: ModelsConfig = {
      local: { cheap: "a", balanced: "b", high: "c" },
      openrouter: { cheap: "d", balanced: "e", high: "f" },
      "direct-anthropic": { cheap: "g", balanced: "h", high: "i" },
      "direct-openai": { cheap: "j", balanced: "k", high: "l" },
    };
    expect(resolveModel("local", "high", NO_ENV, models).model).toBe("c");
  });
});

describe("DEFAULT_MODELS", () => {
  it("is loaded from models.json and exposes all four routing keys", () => {
    expect(Object.keys(DEFAULT_MODELS).sort()).toEqual(
      ["direct-anthropic", "direct-openai", "local", "openrouter"].sort(),
    );
  });
});
