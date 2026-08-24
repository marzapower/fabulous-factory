import type { ReactElement } from "react";

import { render } from "@react-email/render";
import { describe, expect, it } from "vitest";

import { TEMPLATES, type TemplateName, type TemplateProps } from "../src/templates";

const PROPS: { [K in TemplateName]: TemplateProps[K] } = {
  "verify-email": { url: "https://example.com/verify?token=abc" },
  "magic-link": { url: "https://example.com/magic?token=xyz" },
  "reset-password": { url: "https://example.com/reset-password/abc" },
  "delete-account": { url: "https://example.com/delete-user/callback?token=xyz" },
};

// Indexing TEMPLATES/PROPS by the widened `TemplateName` union `describe.each` hands the
// callback below doesn't type-check directly (TS can't correlate which union member each
// call uses); a small generic helper — indexed by its own type param `K`, not the outer
// union — restores the per-key correlation.
function renderElement<K extends TemplateName>(name: K): ReactElement {
  return TEMPLATES[name](PROPS[name]);
}

describe.each(Object.keys(TEMPLATES) as TemplateName[])("templates — %s", (name) => {
  it("renders without throwing and produces both an html and a text version", async () => {
    const element = renderElement(name);

    const html = await render(element);
    const text = await render(element, { plainText: true });

    expect(typeof html).toBe("string");
    expect(html).toContain("<html");
    expect(html).toContain(PROPS[name].url);

    expect(typeof text).toBe("string");
    expect(text.length).toBeGreaterThan(0);
    expect(text).toContain(PROPS[name].url);
  });
});
