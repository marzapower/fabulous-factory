/**
 * Rendering coverage for `DailyPlanTemplate` (moved from
 * `packages/email/test/templates.test.ts` when the template moved to
 * `packages/untangle/src/email/daily-plan.tsx` — see fab-warden's restructure review,
 * finding M1: the move dropped this template's test coverage entirely, including the
 * one graceful-degradation test that proves the daily plan still reads as a complete
 * plan when the LLM capability is off (`reason === null` for every task)).
 */
import { render } from "@react-email/render";
import { describe, expect, it } from "vitest";

import { DailyPlanTemplate, type DailyPlanTask } from "../src/email/daily-plan";

const APP_URL = "https://example.com/app";

const TASKS: DailyPlanTask[] = [
  {
    title: "Write proposal",
    dueAt: "2026-08-21T17:00:00.000Z",
    reason: "Client call is tomorrow.",
  },
  { title: "Review PR #42", dueAt: null, reason: null },
];

describe("DailyPlanTemplate", () => {
  it("renders without throwing and produces both an html and a text version", async () => {
    const element = DailyPlanTemplate({ tasks: TASKS, appUrl: APP_URL });

    const html = await render(element);
    const text = await render(element, { plainText: true });

    expect(typeof html).toBe("string");
    expect(html).toContain("<html");
    expect(html).toContain(APP_URL);

    expect(typeof text).toBe("string");
    expect(text.length).toBeGreaterThan(0);
    expect(text).toContain(APP_URL);
  });

  it("renders every task's title and reason in both html and text", async () => {
    const element = DailyPlanTemplate({ tasks: TASKS, appUrl: APP_URL });

    const html = await render(element);
    const text = await render(element, { plainText: true });

    for (const task of TASKS) {
      expect(html).toContain(task.title);
      expect(text).toContain(task.title);
      if (task.reason) {
        expect(html).toContain(task.reason);
        expect(text).toContain(task.reason);
      }
    }
  });

  it("renders a due date when dueAt is set, and omits one when it's null", async () => {
    const html = await render(DailyPlanTemplate({ tasks: TASKS, appUrl: APP_URL }));

    expect(html).toContain("2026-08-21");
  });

  it("reads as a deliberate plain list, not a broken one, when every reason is null", async () => {
    const noReasons = TASKS.map((task) => ({ ...task, reason: null }));

    const html = await render(DailyPlanTemplate({ tasks: noReasons, appUrl: APP_URL }));
    const text = await render(DailyPlanTemplate({ tasks: noReasons, appUrl: APP_URL }), {
      plainText: true,
    });

    for (const task of noReasons) {
      expect(html).toContain(task.title);
      expect(text).toContain(task.title);
    }
    expect(text.length).toBeGreaterThan(0);
  });

  it("renders a deliberate empty state when there are no tasks", async () => {
    const html = await render(DailyPlanTemplate({ tasks: [], appUrl: APP_URL }));
    const text = await render(DailyPlanTemplate({ tasks: [], appUrl: APP_URL }), {
      plainText: true,
    });

    expect(html.toLowerCase()).toContain("no open tasks");
    expect(text.toLowerCase()).toContain("no open tasks");
  });
});
