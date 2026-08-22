---
name: swap-llm-provider
description: Switch which LLM profile and models your product uses — local, OpenRouter, or direct provider keys. Use when the default profile isn't the one you want in production, or a model routing needs to change.
---

# Swap LLM provider

`@factory/llm` resolves a **profile** (`local` | `openrouter` | `direct` | `disabled`)
from whichever credentials are present, then routes `(quality tier, profile) → model id`
from plain config — never code.

## Phase 1 — Pick a profile

Env vars (names from `packages/config/src/registry.ts`):

- **`local`** — set `LLM_LOCAL_BASE_URL` to an OpenAI-compatible endpoint (e.g. Ollama's
  `http://localhost:11434/v1`). Zero cost, needs a model running locally.
- **`openrouter`** — set `OPENROUTER_API_KEY`. Recommended production default: one key,
  every model.
- **`direct`** — set `ANTHROPIC_API_KEY` and/or `OPENAI_API_KEY` (Anthropic wins if both
  are present).
- **`LLM_PROFILE`** — optional explicit override when more than one credential set is
  present and auto-detection would pick the wrong one.

Unset all of them and the capability is `disabled`: callers get a typed
`LlmDisabledError`.

## Phase 2 — Routing and models

Quality tiers (`cheap` | `balanced` | `high`) route to model IDs per profile. Override a
tier with `LLM_MODEL_CHEAP` / `LLM_MODEL_BALANCED` / `LLM_MODEL_HIGH` — **the ID must be
valid for the ACTIVE profile's provider** (OpenRouter IDs look like
`anthropic/claude-haiku-4.5`; direct Anthropic IDs look like `claude-haiku-4-5`). A
profile switch invalidates a stale override — re-check these three vars whenever you
change `LLM_PROFILE`.

Cost math reads `packages/llm/pricing.json`, a plain JSON file, not code — update it when
a provider changes prices. An unrecognized model degrades gracefully: the call still
runs, its cost row is flagged `costSource: "unknown"`, and doctor warns.

## Phase 3 — Verify

```bash
pnpm factory:doctor
```

Confirms which profile is active, which adapter resolved, and prints the exact env vars
that would change it. If the report doesn't match what you expected, re-check for a
credential you forgot to unset — auto-detection picks whichever is present, and
`LLM_PROFILE` is the only way to force a specific one.
