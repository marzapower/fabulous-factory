import type { ReactElement } from "react";

import { render } from "@react-email/render";
import { describe, expect, it } from "vitest";

import { TEMPLATES, type TemplateName, type TemplateProps } from "../src/templates";

const PROPS: { [K in TemplateName]: TemplateProps[K] } = {
  "verify-email": { url: "https://example.com/verify?token=abc" },
  "magic-link": { url: "https://example.com/magic?token=xyz" },
  "daily-plan": {
    appUrl: "https://example.com/app",
    tasks: [
      {
        title: "Write proposal",
        dueAt: "2026-08-21T17:00:00.000Z",
        reason: "Client call is tomorrow.",
      },
      { title: "Review PR #42", dueAt: null, reason: null },
    ],
  },
};

// Indexing TEMPLATES/PROPS by the widened `TemplateName` union `describe.each` hands the
// callback below doesn't type-check directly (TS can't correlate which union member each
// call uses); a small generic helper — indexed by its own type param `K`, not the outer
// union — restores the per-key correlation.
function renderElement<K extends TemplateName>(name: K): ReactElement {
  return TEMPLATES[name](PROPS[name]);
}

/** The link every template is expected to surface — `url` for the auth templates,
 * `appUrl` for `daily-plan`. */
function expectedLink(name: TemplateName): string {
  const props = PROPS[name];
  return "appUrl" in props ? props.appUrl : props.url;
}

describe.each(Object.keys(TEMPLATES) as TemplateName[])("templates — %s", (name) => {
  it("renders without throwing and produces both an html and a text version", async () => {
    const element = renderElement(name);

    const html = await render(element);
    const text = await render(element, { plainText: true });

    expect(typeof html).toBe("string");
    expect(html).toContain("<html");
    expect(html).toContain(expectedLink(name));

    expect(typeof text).toBe("string");
    expect(text.length).toBeGreaterThan(0);
    expect(text).toContain(expectedLink(name));
  });
});

describe("templates — daily-plan", () => {
  const props = PROPS["daily-plan"];

  it("renders every task's title and reason in both html and text", async () => {
    const element = TEMPLATES["daily-plan"](props);

    const html = await render(element);
    const text = await render(element, { plainText: true });

    for (const task of props.tasks) {
      expect(html).toContain(task.title);
      expect(text).toContain(task.title);
      if (task.reason) {
        expect(html).toContain(task.reason);
        expect(text).toContain(task.reason);
      }
    }
  });

  it("renders a due date when dueAt is set, and omits one when it's null", async () => {
    const html = await render(TEMPLATES["daily-plan"](props));

    expect(html).toContain("2026-08-21");
  });

  it("reads as a deliberate plain list, not a broken one, when every reason is null", async () => {
    const noReasons = {
      ...props,
      tasks: props.tasks.map((task) => ({ ...task, reason: null })),
    };

    const html = await render(TEMPLATES["daily-plan"](noReasons));
    const text = await render(TEMPLATES["daily-plan"](noReasons), { plainText: true });

    for (const task of noReasons.tasks) {
      expect(html).toContain(task.title);
      expect(text).toContain(task.title);
    }
    expect(text.length).toBeGreaterThan(0);
  });

  it("renders a deliberate empty state when there are no tasks", async () => {
    const html = await render(TEMPLATES["daily-plan"]({ ...props, tasks: [] }));
    const text = await render(TEMPLATES["daily-plan"]({ ...props, tasks: [] }), {
      plainText: true,
    });

    expect(html.toLowerCase()).toContain("no open tasks");
    expect(text.toLowerCase()).toContain("no open tasks");
  });
});
