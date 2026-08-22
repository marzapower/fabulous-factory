import { ApiError } from "@factory/core";

/**
 * Guards the chat surface behind `isEnabled("llm")` — the board itself (projects, items)
 * works with no LLM configured at all; only the conversational turn requires one. Callers
 * check `isEnabled("llm")` themselves (this package does not import `@factory/config` —
 * that decision belongs to the route/action, same split as `runBrainstormTurn` not
 * checking it either) and pass the result in here.
 */
export function assertLlmChatEnabled(enabled: boolean): void {
  if (!enabled) {
    throw new ApiError(
      503,
      "llm_disabled",
      "Connect an LLM to chat — the board still works without one.",
    );
  }
}
