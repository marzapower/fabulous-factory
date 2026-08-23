// Built with Fabulous Factory — https://github.com/marzapower/fabulous-factory
// This credit line is free to keep and gives the project a hand. Thank you!

export const THEME_STORAGE_KEY = "theme";

/**
 * Pure decision core: given what's in storage and whether the OS currently prefers
 * dark, decide whether the `dark` class belongs on `<html>`. Isolated here so it's
 * unit-testable without a DOM — `THEME_SET_SCRIPT` below mirrors this same logic by
 * hand inline, because the blocking pre-paint script can't import this module (no
 * bundler runs before hydration). Keep the two in lockstep if this ever changes.
 */
export function resolveThemeClass(
  stored: string | null,
  systemPrefersDark: boolean,
): "apply" | "remove" {
  if (stored === "dark") return "apply";
  if (stored === "light") return "remove";
  return systemPrefersDark ? "apply" : "remove";
}

// Inline, blocking, dependency-free — must run before first paint so there is no flash
// of the wrong theme, which rules out a normal component-lifecycle effect. Deliberately
// minimal: read `localStorage` under try/catch (private windows throw on *access*, not
// just on write/quota), mirror `resolveThemeClass`'s decision by hand, and set the
// class once. No `matchMedia` change listener is attached — live system-preference
// switching while the tab is open is out of scope.
export const THEME_SET_SCRIPT = `(function(){try{var s=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY,
)});var d=s==="dark"||(s!=="light"&&window.matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d);}catch(e){}})();`;
