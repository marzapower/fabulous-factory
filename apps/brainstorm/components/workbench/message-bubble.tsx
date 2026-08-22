import type { ReactNode } from "react";

import type { ProjectMessage } from "@factory/brainstorm";

import { cn } from "@/lib/utils";

function formatTime(date: Date): string {
  return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export function MessageBubble({
  message,
  children,
}: {
  message: ProjectMessage;
  /** Proposal cards born in this exact turn — assistant bubbles only. */
  children?: ReactNode;
}) {
  const isUser = message.role === "user";

  return (
    <div className={cn("flex flex-col gap-2", isUser ? "items-end" : "items-start")}>
      <div
        className={cn(
          "max-w-[85%] rounded-lg px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap",
          isUser
            ? "bg-bench-ink text-bench-paper"
            : "border border-bench-line bg-bench-paper text-bench-ink",
        )}
      >
        {message.content}
      </div>
      <span className="font-mono text-[0.65rem] text-muted-foreground">
        {formatTime(new Date(message.createdAt))}
      </span>
      {children ? <div className="flex w-full max-w-[85%] flex-col gap-2">{children}</div> : null}
    </div>
  );
}
