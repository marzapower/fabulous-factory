import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./globals.css";

// Convention (see docs/superpowers/plans §B.4): the root layout stays config-free.
// Next statically prerenders /_not-found at build time, and that render includes the
// root layout — a getClientConfig() call here would freeze build-machine capabilities
// into static HTML, violating design spec §5.1. Config reads live only in force-dynamic
// pages (see app/page.tsx). Importing global (Tailwind) styles is static CSS, not config,
// and is fine here.
export const metadata: Metadata = {
  title: "Fabulous Factory",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-svh bg-background font-sans text-foreground antialiased">
        {children}
      </body>
    </html>
  );
}
