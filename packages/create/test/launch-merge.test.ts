import { describe, expect, it } from "vitest";

import { LAUNCH_ITEMS_MARKER, mergeLaunchChecklist } from "../src/lib/launch-merge";

describe("mergeLaunchChecklist", () => {
  it("replaces the marker with the trimmed preset fragment", () => {
    const base = ["## [ ] Item one", "", LAUNCH_ITEMS_MARKER, "", "## [ ] Item two"].join("\n");
    const fragment = "\n## [ ] Demo logic\n\n## [ ] Template showcase\n";

    const merged = mergeLaunchChecklist(base, fragment);

    expect(merged).toBe(
      [
        "## [ ] Item one",
        "",
        "## [ ] Demo logic\n\n## [ ] Template showcase",
        "",
        "## [ ] Item two",
      ].join("\n"),
    );
  });

  it("preserves the surrounding blank-line spacing from the base payload", () => {
    const base = `before\n\n${LAUNCH_ITEMS_MARKER}\n\nafter`;
    const merged = mergeLaunchChecklist(base, "fragment");
    expect(merged).toBe("before\n\nfragment\n\nafter");
  });

  it("throws a clear error when the marker is missing", () => {
    expect(() => mergeLaunchChecklist("no marker here", "fragment")).toThrow(
      /preset:items.*insertion marker/,
    );
  });

  it("supports a custom marker string", () => {
    const merged = mergeLaunchChecklist("before <<HERE>> after", "X", "<<HERE>>");
    expect(merged).toBe("before X after");
  });
});
