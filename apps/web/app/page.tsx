import Link from "next/link";

import { getClientConfig } from "@factory/config";
import { ClientConfigProvider } from "@factory/config/client";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CapabilityPanel } from "./capability-panel";

// Capability-conditional UI must render dynamically (design spec §5.1): capabilities are
// a runtime, server-side fact resolved at request time, never baked into a static build.
export const dynamic = "force-dynamic";

export default function HomePage() {
  const config = getClientConfig();

  return (
    <ClientConfigProvider config={config}>
      <main className="mx-auto max-w-2xl px-6 py-12">
        <h1 className="text-3xl font-bold tracking-tight">Fabulous Factory</h1>
        <p className="mt-2 text-lg leading-relaxed text-muted-foreground">
          The human states intent, the agents do the work, the repository enforces the rules.
        </p>

        <div className="mt-6 flex gap-3">
          <Link href="/dashboard" className={cn(buttonVariants({ variant: "default" }))}>
            Dashboard
          </Link>
          <Link href="/login" className={cn(buttonVariants({ variant: "outline" }))}>
            Sign in
          </Link>
          <Link href="/signup" className={cn(buttonVariants({ variant: "outline" }))}>
            Sign up
          </Link>
        </div>

        <CapabilityPanel />
      </main>
    </ClientConfigProvider>
  );
}
