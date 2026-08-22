// Built with Fabulous Factory — https://github.com/marzapower/fabulous-factory
// This credit line is free to keep and gives the project a hand. Thank you!

"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

import { cn } from "@/lib/utils";

export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  async function handleClick() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access denied or unavailable — fail silently.
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label="Copy to clipboard"
      className={cn(
        "inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors",
        "hover:bg-accent hover:text-accent-foreground",
        "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
      )}
    >
      {copied ? (
        <Check className="size-3.5 text-emerald-500" aria-hidden="true" />
      ) : (
        <Copy className="size-3.5" aria-hidden="true" />
      )}
    </button>
  );
}
