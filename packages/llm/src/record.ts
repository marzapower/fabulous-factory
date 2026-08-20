/**
 * Per-call usage accounting (plan F.4/F.2.8/F.10.2). `recordLlmCall` is the ONLY writer of
 * the `llm_calls` table: a plain `getDb().insert(...)` against `@factory/db`'s schema, no
 * `drizzle-orm` import here at all (F.10.2 — a bare insert needs no query operators, and
 * importing `drizzle-orm` directly from this package would violate the
 * `no-bare-drizzle-outside-db-core` boundary rule).
 *
 * Awaited but fail-open (F.2.8): a serverless function can freeze right after a
 * fire-and-forget write, silently losing the row — so the insert is awaited — but an
 * accounting failure must never break the caller's `generate()` call, so any insert error
 * is caught and logged, never rethrown.
 */
import { getDb, schema } from "@factory/db";
import { captureException } from "@factory/observability";

export interface LlmCallRecord {
  promptId: string | null;
  profile: string;
  model: string;
  quality: string;
  inputTokens: number | null;
  outputTokens: number | null;
  costCents: number | null;
  costSource: "reported" | "estimated" | "unknown";
  latencyMs: number;
  ok: boolean;
  errorCode: string | null;
}

export async function recordLlmCall(record: LlmCallRecord): Promise<void> {
  const row: typeof schema.llmCalls.$inferInsert = {
    promptId: record.promptId,
    profile: record.profile,
    model: record.model,
    quality: record.quality,
    inputTokens: record.inputTokens,
    outputTokens: record.outputTokens,
    costCents: record.costCents,
    costSource: record.costSource,
    latencyMs: record.latencyMs,
    ok: record.ok,
    errorCode: record.errorCode,
  };

  try {
    await getDb().insert(schema.llmCalls).values(row);
  } catch (error) {
    // Fail-open, but VISIBLY (review finding, M5): a broken accounting path means cost
    // data is silently lost — report it through the errors capability (no-op without
    // SENTRY_DSN) instead of only a stdout line nobody tails.
    console.error("[@factory/llm] failed to record llm_calls row", error);
    captureException(error, { source: "recordLlmCall", model: record.model });
  }
}
