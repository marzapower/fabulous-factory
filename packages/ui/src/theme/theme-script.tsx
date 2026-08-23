// Built with Fabulous Factory — https://github.com/marzapower/fabulous-factory
// This credit line is free to keep and gives the project a hand. Thank you!

import { THEME_SET_SCRIPT } from "./script";

// Server-safe (no "use client" needed — it renders a plain <script> tag, nothing here
// runs in the browser except the inlined string). Must be the first child of <body> so
// it executes before any themed pixel paints.
export function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: THEME_SET_SCRIPT }} />;
}
