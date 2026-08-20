import { render } from "@react-email/render";
import { describe, expect, it } from "vitest";

import { TEMPLATES, type TemplateName } from "../src/templates";

const PROPS: Record<TemplateName, { url: string }> = {
  "verify-email": { url: "https://example.com/verify?token=abc" },
  "magic-link": { url: "https://example.com/magic?token=xyz" },
};

describe.each(Object.keys(TEMPLATES) as TemplateName[])("templates — %s", (name) => {
  it("renders without throwing and produces both an html and a text version", async () => {
    const element = TEMPLATES[name](PROPS[name]);

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
