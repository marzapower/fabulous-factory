// Built with Fabulous Factory — https://github.com/marzapower/fabulous-factory
// This credit line is free to keep and gives the project a hand. Thank you!

"use client";

import { Moon, Sun } from "lucide-react";

import { buttonVariants } from "../primitives/button";
import { cn } from "../lib/utils";
import { THEME_STORAGE_KEY } from "./script";

// Both icons render unconditionally, server and client alike — which one is visible is
// decided purely by CSS (`dark:hidden` / `hidden dark:block`, following the `.dark`
// class `ThemeScript` already set before paint). No component state, so no hydration
// mismatch is possible: there is nothing for the server and client renders to disagree
// on until a click happens.
export function ThemeToggle() {
  function handleClick() {
    const root = document.documentElement;
    const next = root.classList.contains("dark") ? "light" : "dark";
    root.classList.toggle("dark", next === "dark");
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Private windows / storage-denied browsers — the class still flips for this
      // page view, it just won't be remembered on the next visit.
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label="Toggle theme"
      className={cn(buttonVariants({ variant: "ghost", size: "icon" }))}
    >
      <Sun className="dark:hidden" aria-hidden="true" />
      <Moon className="hidden dark:block" aria-hidden="true" />
    </button>
  );
}
