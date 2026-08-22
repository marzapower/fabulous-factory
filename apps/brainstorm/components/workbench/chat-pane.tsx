"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";

import type { ProjectItem, ProjectMessage } from "@factory/brainstorm";

import { Button } from "@/components/ui/button";

import { MessageBubble } from "./message-bubble";
import { ProposalCard } from "./proposal-card";
import type { TurnState } from "./turn-reducer";

const MESSAGE_MAX_CHARS = 4000;

export interface ChatPaneProps {
  messages: ProjectMessage[];
  items: ProjectItem[];
  /** Item ids proposed by each assistant message's turn — populated once that turn folds
   * into permanent history. Rendered inline right under the message they came from, using
   * `items` as the single live source of truth (the SAME data the board's "Pending"
   * section reads) — accepting/dismissing here or on the board updates one shared state,
   * so both views can never drift apart. */
  turnProposalsByMessageId: Record<string, string[]>;
  turnState: TurnState;
  /** `false` while the current turn is still streaming (or just finished and not yet
   * folded into `messages`/`items` by the caller) — gates the LIVE, ephemeral rendering
   * below, sourced from `turnState.chunks` rather than `items` (the underlying rows don't
   * exist server-side yet while streaming). */
  turnFolded: boolean;
  isStreaming: boolean;
  sendError: string | null;
  /** Server-resolved at page load (`isEnabled("llm")`) — the honest baseline. The live
   * `turnState.phase === "disabled"` case layers on top for the rarer race where the key
   * disappears between page load and send. */
  llmEnabled: boolean;
  onSend: (text: string) => void;
  onAcceptProposal: (id: string) => void;
  onDismissProposal: (id: string) => void;
}

export function ChatPane({
  messages,
  items,
  turnProposalsByMessageId,
  turnState,
  turnFolded,
  isStreaming,
  sendError,
  llmEnabled,
  onSend,
  onAcceptProposal,
  onDismissProposal,
}: ChatPaneProps) {
  const [text, setText] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const chatOff = !llmEnabled || turnState.phase === "disabled";
  const itemsById = new Map(items.map((item) => [item.id, item]));

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages.length, turnState.chunks.length]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || isStreaming) return;
    onSend(trimmed);
    setText("");
  }

  const liveSayText = turnState.chunks
    .filter((c) => c.kind === "say")
    .map((c) => c.text)
    .join(" ");
  const liveProposals = turnState.chunks.filter((c) => c.kind === "proposal");
  const showLiveTurn = !turnFolded && turnState.phase !== "idle";

  return (
    <div className="flex h-full flex-col gap-3">
      <div ref={scrollRef} className="flex flex-1 flex-col gap-4 overflow-y-auto p-1">
        {messages.length === 0 && !showLiveTurn ? (
          <p className="text-sm text-muted-foreground">
            Say what you&rsquo;re circling. The board fills in as ideas spark.
          </p>
        ) : null}

        {messages.map((message) => {
          const proposalIds = turnProposalsByMessageId[message.id] ?? [];
          return (
            <MessageBubble key={message.id} message={message}>
              {proposalIds.length > 0
                ? proposalIds.map((id) => {
                    const item = itemsById.get(id);
                    if (!item) return null;
                    return (
                      <ProposalCard
                        key={id}
                        id={item.id}
                        kind={item.kind}
                        title={item.title}
                        detail={item.detail}
                        accepted={item.status === "accepted"}
                        onAccept={() => onAcceptProposal(item.id)}
                        onDismiss={() => onDismissProposal(item.id)}
                      />
                    );
                  })
                : null}
            </MessageBubble>
          );
        })}

        {showLiveTurn ? (
          <div aria-live="polite" className="flex flex-col gap-2">
            {(liveSayText || turnState.phase === "streaming") && (
              <div className="flex max-w-[85%] items-start gap-2 rounded-lg border border-bench-line bg-bench-paper px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap text-bench-ink">
                <span>{liveSayText}</span>
                {turnState.phase === "streaming" && (
                  <span aria-hidden="true" className="spark-caret text-spark">
                    ▍
                  </span>
                )}
              </div>
            )}

            {liveProposals.map((chunk) => (
              <ProposalCard
                key={chunk.proposal.id}
                id={chunk.proposal.id}
                kind={chunk.proposal.kind}
                title={chunk.proposal.title}
                detail={chunk.proposal.detail}
                accepted={false}
                unsaved={chunk.unsaved}
                pending={turnState.phase === "streaming"}
              />
            ))}

            {turnState.phase === "finished" && turnState.finishedStatus === "empty" && (
              <p className="text-sm text-muted-foreground">
                I came up empty — try giving me one more concrete detail.
              </p>
            )}

            {turnState.error && (
              <p className="text-xs text-destructive" role="alert">
                {turnState.error.message}
              </p>
            )}
          </div>
        ) : null}

        {sendError && (
          <p className="text-xs text-destructive" role="alert">
            {sendError}
          </p>
        )}
      </div>

      {chatOff ? (
        <p className="rounded-md border border-bench-line bg-muted px-3 py-2 text-xs text-muted-foreground">
          {turnState.disabledMessage ??
            "Chat needs an LLM key — see /features/llm. Your board still works."}
        </p>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-2">
          <label className="sr-only" htmlFor="turn-input">
            Message
          </label>
          <textarea
            id="turn-input"
            value={text}
            maxLength={MESSAGE_MAX_CHARS}
            onChange={(e) => setText(e.target.value)}
            disabled={isStreaming}
            rows={3}
            placeholder="What are you circling?"
            className="w-full resize-y rounded-md border border-bench-line bg-background p-3 text-sm leading-relaxed disabled:opacity-60"
          />
          <Button type="submit" disabled={isStreaming || !text.trim()} className="self-start">
            {isStreaming ? "Thinking…" : "Send"}
          </Button>
        </form>
      )}
    </div>
  );
}
