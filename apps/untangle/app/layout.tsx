import type { Metadata } from "next";
import localFont from "next/font/local";
import type { ReactNode } from "react";

import "./globals.css";

// Convention (see docs/superpowers/plans §B.4): the root layout stays config-free.
// Next statically prerenders /_not-found at build time, and that render includes the
// root layout — a getClientConfig() call here would freeze build-machine capabilities
// into static HTML, violating design spec §5.1. Config reads live only in force-dynamic
// pages (see app/page.tsx). Importing global (Tailwind) styles is static CSS, not config,
// and is fine here. next/font/local is build-time static too (the files are vendored in
// ./fonts, resolved and self-hosted at build time, no network fetch, no config), so it's
// legal here for the same reason.
const plexSans = localFont({
  src: [
    { path: "./fonts/ibm-plex-sans-400.woff2", weight: "400", style: "normal" },
    { path: "./fonts/ibm-plex-sans-600.woff2", weight: "600", style: "normal" },
    { path: "./fonts/ibm-plex-sans-700.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-plex-sans",
  display: "swap",
});

const plexMono = localFont({
  src: [
    { path: "./fonts/ibm-plex-mono-400.woff2", weight: "400", style: "normal" },
    { path: "./fonts/ibm-plex-mono-500.woff2", weight: "500", style: "normal" },
  ],
  variable: "--font-plex-mono",
  display: "swap",
});

/**
 * The PRODUCT's metadata, not the template's — `/` is Untangle's landing page and the
 * browser tab has to agree with it, or the demo stops being a demo. The template gets
 * its own title on `/features`, and `make-it-yours` points an adopter here as one of the
 * strings to rename.
 */
export const metadata: Metadata = {
  title: {
    default: "Fabulous Untangle — paste the mess, get the list",
    template: "%s · Fabulous Untangle",
  },
  description:
    "Paste an unsorted brain dump and get back a task list: what's actually a task, when each one matters, and the big ones split into steps you can start. The sample product that ships with Fabulous Factory.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${plexSans.variable} ${plexMono.variable}`}>
      <body className="min-h-svh bg-background font-sans text-foreground antialiased">
        {children}
      </body>
    </html>
  );
}
