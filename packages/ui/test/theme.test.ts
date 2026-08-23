import { describe, expect, it } from "vitest";

import { resolveThemeClass, THEME_SET_SCRIPT, THEME_STORAGE_KEY } from "../src/theme/script";

describe("resolveThemeClass", () => {
  it('applies dark when the stored preference is "dark", regardless of system preference', () => {
    expect(resolveThemeClass("dark", false)).toBe("apply");
    expect(resolveThemeClass("dark", true)).toBe("apply");
  });

  it('removes dark when the stored preference is "light", regardless of system preference', () => {
    expect(resolveThemeClass("light", true)).toBe("remove");
    expect(resolveThemeClass("light", false)).toBe("remove");
  });

  it("falls back to the system preference when nothing is stored", () => {
    expect(resolveThemeClass(null, true)).toBe("apply");
    expect(resolveThemeClass(null, false)).toBe("remove");
  });

  it('falls back to the system preference when the stored value is neither "dark" nor "light"', () => {
    expect(resolveThemeClass("system", true)).toBe("apply");
    expect(resolveThemeClass("", false)).toBe("remove");
  });
});

describe("THEME_SET_SCRIPT", () => {
  // The blocking pre-paint script can't import resolveThemeClass (no bundler runs
  // before hydration), so it mirrors that decision by hand. These pin the source text
  // for the parts that matter — that it degrades gracefully in private windows and reads
  // the same key the toggle writes — without executing it (it targets `document`/
  // `window`, which don't exist in this package's node test environment).
  it("wraps localStorage access in a try/catch", () => {
    expect(THEME_SET_SCRIPT).toMatch(/try\s*{/);
    expect(THEME_SET_SCRIPT).toMatch(/catch\s*\(e\)\s*{}/);
  });

  it("reads the same storage key the toggle writes", () => {
    expect(THEME_STORAGE_KEY).toBe("theme");
    expect(THEME_SET_SCRIPT).toContain(
      `localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)})`,
    );
  });

  it("falls back to matchMedia's prefers-color-scheme when nothing is stored", () => {
    expect(THEME_SET_SCRIPT).toContain('matchMedia("(prefers-color-scheme: dark)")');
  });

  it("is a single self-invoking expression with no listener attached", () => {
    expect(THEME_SET_SCRIPT.trim().startsWith("(function(){")).toBe(true);
    expect(THEME_SET_SCRIPT).not.toContain("addEventListener");
  });
});
