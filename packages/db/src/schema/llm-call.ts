import { boolean, integer, numeric, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * Per-call LLM usage accounting (spec §5.4, plan F.3) — written by `packages/llm`'s
 * `recordLlmCall` (awaited, fail-open: an insert failure must never break the caller).
 * Failed generations are recorded too (`ok = false`, `errorCode` set, NULL usage/cost).
 *
 * `costCents` uses `mode: "number"` (F.10.3 — drizzle numeric defaults to string mode)
 * with scale 6: fractions of a cent are the norm for small calls. `costSource` is
 * 'reported' (provider-returned actual cost, e.g. OpenRouter) | 'estimated'
 * (pricing.json math, incl. the local profile's flat 0) | 'unknown' (model missing from
 * pricing.json or provider omitted usage — call allowed, doctor warns; F.10.7).
 */
export const llmCalls = pgTable("llm_calls", {
  id: uuid("id").primaryKey().defaultRandom(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  promptId: text("prompt_id"),
  profile: text("profile").notNull(),
  model: text("model").notNull(),
  quality: text("quality").notNull(),
  inputTokens: integer("input_tokens"),
  outputTokens: integer("output_tokens"),
  costCents: numeric("cost_cents", { precision: 14, scale: 6, mode: "number" }),
  costSource: text("cost_source").notNull(),
  latencyMs: integer("latency_ms").notNull(),
  ok: boolean("ok").notNull(),
  errorCode: text("error_code"),
});
