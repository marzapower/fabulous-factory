/**
 * Base class for typed `@factory/llm` errors (plan F.4). Every subclass carries a
 * machine-readable `code` alongside the human-readable `message`, and `name` is derived
 * from `new.target` so `instanceof` checks AND `error.name`/stack traces agree with the
 * concrete subclass, without every subclass having to repeat `this.name = "..."`.
 */
export class LlmError extends Error {
  readonly code: string;

  constructor(code: string, message?: string) {
    super(message ?? code);
    this.name = new.target.name;
    this.code = code;
  }
}

/**
 * Thrown when `generate()` is called while the `llm` capability is `'disabled'` (no
 * profile has usable credentials). Thrown before any provider module is loaded (plan
 * F.2.3).
 */
export class LlmDisabledError extends LlmError {
  constructor(message?: string) {
    super("llm_disabled", message ?? "The LLM capability is disabled for this environment.");
  }
}

/**
 * Thrown by the pre-call budget check (plan F.2.7) when the estimated cost of a call
 * against a KNOWN model exceeds the caller-supplied `maxCostCents`. Never thrown for an
 * unknown model — no estimate is possible, so the call is allowed through instead.
 */
export class LlmBudgetExceededError extends LlmError {
  readonly estimatedCostCents: number;
  readonly maxCostCents: number;

  constructor(estimatedCostCents: number, maxCostCents: number, message?: string) {
    super(
      "llm_budget_exceeded",
      message ??
        `Estimated cost ${estimatedCostCents}¢ exceeds the ${maxCostCents}¢ budget for this call.`,
    );
    this.estimatedCostCents = estimatedCostCents;
    this.maxCostCents = maxCostCents;
  }
}
