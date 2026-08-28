"use client";

import { useEffect, useRef, useState } from "react";

import type { ItemKind, Project, ProjectItem, ProjectMessage } from "@factory/brainstorm";

import {
  addItemAction,
  deleteItemAction,
  setItemStatusAction,
  updateItemAction,
} from "@/app/[locale]/projects/[id]/actions";

import { BoardPane } from "./board-pane";
import { ChatPane } from "./chat-pane";
import { useTurn } from "./use-turn";

export interface WorkbenchProps {
  project: Project;
  messages: ProjectMessage[];
  items: ProjectItem[];
  llmEnabled: boolean;
}

/** Same fallback string the server persists when a turn produces no prose at all
 * (`app/api/chat/route.ts`'s `EMPTY_TURN_MESSAGE`) — kept identical on purpose so the
 * locally-folded transcript never disagrees with what a page reload would show. */
const EMPTY_TURN_MESSAGE = "I came up empty — try giving me one more concrete detail.";

/**
 * The workbench's client half — composes the chat pane and the board pane around
 * `useTurn`'s stream. Mirrors `apps/untangle/components/workspace/workspace.tsx`'s split
 * between server-persisted state and this session's live state, folded into one shared
 * `items`/`messages` view so `ChatPane`'s inline proposal cards and `BoardPane`'s pending
 * list read the exact same rows — accepting a card in either place can never drift the
 * other out of sync.
 */
export function Workbench({
  project,
  messages: initialMessages,
  items: initialItems,
  llmEnabled,
}: WorkbenchProps) {
  const [messages, setMessages] = useState<ProjectMessage[]>(initialMessages);
  const [items, setItems] = useState<ProjectItem[]>(initialItems);
  const [turnProposalsByMessageId, setTurnProposalsByMessageId] = useState<
    Record<string, string[]>
  >({});
  // `false` while the current turn is still streaming/just-finished-but-not-yet-folded —
  // gates whether ChatPane reads the live `turnState` or the folded `messages`/`items`.
  const [turnFolded, setTurnFolded] = useState(true);
  const foldedPhaseRef = useRef<string | null>(null);
  // Below `lg` the two panes collapse into a tab switch (design mandate) — `lg` and up
  // ignore this entirely and show both panes side by side via the grid below.
  const [mobileTab, setMobileTab] = useState<"chat" | "board">("chat");

  const { state: turnState, isStreaming, error: sendError, submit } = useTurn(project.id);

  useEffect(() => {
    if (turnFolded) return;
    if (turnState.phase !== "finished") return;
    // Guard against re-folding the same finished turn on an unrelated re-render.
    if (foldedPhaseRef.current === "finished") return;
    foldedPhaseRef.current = "finished";

    const sayChunks = turnState.chunks.filter((c) => c.kind === "say");
    const sayText = sayChunks.map((c) => c.text).join(" ");
    const proposalChunks = turnState.chunks.filter((c) => c.kind === "proposal");

    const assistantMessage: ProjectMessage = {
      id: crypto.randomUUID(),
      projectId: project.id,
      userId: project.userId,
      role: "assistant",
      content: sayText || EMPTY_TURN_MESSAGE,
      createdAt: new Date(),
    };

    const newItems: ProjectItem[] = proposalChunks.map((chunk) => ({
      id: chunk.proposal.id,
      projectId: project.id,
      userId: project.userId,
      kind: chunk.proposal.kind,
      title: chunk.proposal.title,
      detail: chunk.proposal.detail,
      status: "proposed",
      source: "ai",
      createdAt: new Date(),
      updatedAt: new Date(),
    }));

    setMessages((prev) => [...prev, assistantMessage]);
    setItems((prev) => [...prev, ...newItems]);
    if (newItems.length > 0) {
      setTurnProposalsByMessageId((prev) => ({
        ...prev,
        [assistantMessage.id]: newItems.map((item) => item.id),
      }));
    }
    setTurnFolded(true);
  }, [turnState, turnFolded, project.id, project.userId]);

  function handleSend(text: string) {
    setTurnFolded(false);
    foldedPhaseRef.current = null;
    const localUserMessage: ProjectMessage = {
      id: crypto.randomUUID(),
      projectId: project.id,
      userId: project.userId,
      role: "user",
      content: text,
      createdAt: new Date(),
    };
    setMessages((prev) => [...prev, localUserMessage]);
    void submit(text);
  }

  async function handleSetItemStatus(id: string, status: "accepted" | "dismissed") {
    const previous = items;
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, status } : item)));
    const outcome = await setItemStatusAction({ itemId: id, status });
    if (!outcome.ok) {
      setItems(previous);
    }
  }

  async function handleAddItem(kind: ItemKind, input: { title: string; detail: string | null }) {
    const outcome = await addItemAction({
      projectId: project.id,
      kind,
      title: input.title,
      detail: input.detail ?? undefined,
    });
    if (!outcome.ok) return false;
    setItems((prev) => [...prev, outcome.data]);
    return true;
  }

  async function handleEditItem(id: string, patch: { title: string; detail: string | null }) {
    const outcome = await updateItemAction({
      itemId: id,
      title: patch.title,
      detail: patch.detail ?? undefined,
    });
    if (!outcome.ok) return false;
    setItems((prev) => prev.map((item) => (item.id === id ? outcome.data : item)));
    return true;
  }

  async function handleDeleteItem(id: string) {
    const previous = items;
    setItems((prev) => prev.filter((item) => item.id !== id));
    const outcome = await deleteItemAction({ itemId: id });
    if (!outcome.ok) {
      setItems(previous);
    }
  }

  const boardCount = items.filter((i) => i.status !== "dismissed").length;

  return (
    <div className="flex flex-col gap-4">
      <div
        role="tablist"
        aria-label="Workbench panes"
        className="flex gap-1 rounded-md border border-bench-line bg-bench-paper p-1 text-sm lg:hidden"
      >
        <button
          type="button"
          role="tab"
          aria-selected={mobileTab === "chat"}
          onClick={() => setMobileTab("chat")}
          className={`flex-1 rounded-sm px-3 py-1.5 font-medium ${
            mobileTab === "chat"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground"
          }`}
        >
          Chat
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mobileTab === "board"}
          onClick={() => setMobileTab("board")}
          className={`flex-1 rounded-sm px-3 py-1.5 font-medium ${
            mobileTab === "board"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground"
          }`}
        >
          Board <span className="font-mono text-xs text-muted-foreground">({boardCount})</span>
        </button>
      </div>

      <div className="grid gap-6 lg:grid-cols-12">
        <section
          className={`flex min-h-[28rem] flex-col lg:col-span-7 ${mobileTab === "board" ? "hidden lg:flex" : ""}`}
        >
          <ChatPane
            messages={messages}
            items={items}
            turnProposalsByMessageId={turnProposalsByMessageId}
            turnState={turnState}
            turnFolded={turnFolded}
            isStreaming={isStreaming}
            sendError={sendError}
            llmEnabled={llmEnabled}
            onSend={handleSend}
            onAcceptProposal={(id) => void handleSetItemStatus(id, "accepted")}
            onDismissProposal={(id) => void handleSetItemStatus(id, "dismissed")}
          />
        </section>

        <section className={`lg:col-span-5 ${mobileTab === "chat" ? "hidden lg:block" : ""}`}>
          <BoardPane
            items={items}
            onAcceptProposal={(id) => handleSetItemStatus(id, "accepted")}
            onDismissProposal={(id) => handleSetItemStatus(id, "dismissed")}
            onAddItem={handleAddItem}
            onEditItem={handleEditItem}
            onDeleteItem={handleDeleteItem}
          />
        </section>
      </div>
    </div>
  );
}
