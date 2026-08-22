import { describe, expect, it } from "vitest";

import { formatCents, formatDuration, formatDue } from "../components/workspace/format";

describe("formatCents", () => {
  it("renders two decimal places of a cent figure", () => {
    expect(formatCents(0.04)).toBe("0.04¢");
    expect(formatCents(5)).toBe("5.00¢");
  });

  it("renders an em dash for null/undefined — never 0.00¢", () => {
    expect(formatCents(null)).toBe("—");
    expect(formatCents(undefined)).toBe("—");
  });
});

describe("formatDuration", () => {
  it("renders sub-second durations in whole milliseconds", () => {
    expect(formatDuration(240)).toBe("240ms");
    expect(formatDuration(999)).toBe("999ms");
  });

  it("renders durations at or above one second in seconds, one decimal", () => {
    expect(formatDuration(1000)).toBe("1.0s");
    expect(formatDuration(1234)).toBe("1.2s");
  });

  it("renders an em dash for null/undefined", () => {
    expect(formatDuration(null)).toBe("—");
    expect(formatDuration(undefined)).toBe("—");
  });
});

describe("formatDue", () => {
  const now = new Date(2026, 7, 21); // 21 aug 2026, local midnight

  it("renders no due date for null/undefined", () => {
    expect(formatDue(null, now)).toBe("no due date");
    expect(formatDue(undefined, now)).toBe("no due date");
  });

  it("renders no due date for an unparsable string", () => {
    expect(formatDue("not-a-date", now)).toBe("no due date");
  });

  it("renders today/tomorrow/overdue relative to now", () => {
    expect(formatDue(new Date(2026, 7, 21, 9).toISOString(), now)).toBe("today");
    expect(formatDue(new Date(2026, 7, 22, 9).toISOString(), now)).toBe("tomorrow");
    expect(formatDue(new Date(2026, 7, 20, 9).toISOString(), now)).toBe("overdue");
  });

  it("renders a further-out date as 'weekday day month', lowercase", () => {
    // 2026-08-28 is a Friday.
    expect(formatDue(new Date(2026, 7, 28, 9).toISOString(), now)).toBe("fri 28 aug");
  });
});
