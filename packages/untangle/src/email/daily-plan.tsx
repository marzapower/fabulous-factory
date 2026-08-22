/**
 * Minimal hand-authored JSX (plan E.2/E.9) — plain html/body/ol, no components library.
 * See `@factory/email`'s `verify-email.tsx` for why `react-email`/`@react-email/components`
 * aren't a dependency.
 *
 * Untangle domain template (moved out of `@factory/email` — a preset-domain template has
 * no business shipping in a shared package every preset pulls in). Rendered locally by
 * `../tasks/daily-plan.ts`'s `notify` step and handed to `@factory/email`'s
 * `sendRendered()`, which owns the actual transport/degradation path (resend adapter /
 * console / disabled) — this file only ever builds the React element.
 *
 * Sent by the scheduled digest job with today's open tasks (K.7 — replaces
 * `change-digest.tsx`, which shipped with the retired page-monitor demo). `reason` is an
 * LLM-generated one-line "why this matters today"; it is `null` for a task, or for every
 * task, when the LLM capability is off — the list still reads as a deliberate, complete
 * plan in that case, just a plain ordered one (graceful degradation,
 * docs/agents/conventions.md).
 */
export interface DailyPlanTask {
  /** The task title. */
  title: string;
  /** ISO 8601 due date/time, or `null` if the task has no due date. */
  dueAt: string | null;
  /** A one-line "why this matters today" — `null` when the LLM capability is off. */
  reason: string | null;
}

export interface DailyPlanProps {
  /** Today's open tasks, in the order they should be worked. */
  tasks: DailyPlanTask[];
  /** Link back into the app. */
  appUrl: string;
}

/**
 * Slices rather than formats with `Date#toLocaleDateString` — deterministic across
 * timezones and locales, which matters for html/text parity and for tests.
 */
function formatDueDate(dueAt: string): string {
  return dueAt.slice(0, 10);
}

export function DailyPlanTemplate({ tasks, appUrl }: DailyPlanProps) {
  return (
    <html>
      <body>
        <p>Your plan for today:</p>
        {tasks.length === 0 ? (
          <p>No open tasks. Nothing to plan today.</p>
        ) : (
          <ol>
            {tasks.map((task, index) => (
              <li key={index}>
                {task.title}
                {task.dueAt ? ` — due ${formatDueDate(task.dueAt)}` : null}
                {task.reason ? <p>{task.reason}</p> : null}
              </li>
            ))}
          </ol>
        )}
        <p>
          <a href={appUrl}>Open your tasks</a>
        </p>
      </body>
    </html>
  );
}
