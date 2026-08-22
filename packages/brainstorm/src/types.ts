/**
 * Domain types for the brainstorm preset — a chat-based project brainstormer. This is
 * the "renameable" half of the preset's split, same shape as `packages/untangle/src/tasks/`:
 * `make-it-yours` Phase 2 renames this file and everything else under
 * `packages/brainstorm/` to the adopter's own noun.
 */

export type ProjectRole = "user" | "assistant";
export type ItemKind = "idea" | "feature" | "note";
export type ItemStatus = "proposed" | "accepted" | "dismissed";
export type ItemSource = "manual" | "ai";

export interface Project {
  id: string;
  userId: string;
  name: string;
  pitch: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProjectSummary {
  id: string;
  name: string;
  pitch: string | null;
  updatedAt: Date;
  itemCounts: Record<ItemKind, number>;
}

export interface ProjectMessage {
  id: string;
  projectId: string;
  userId: string;
  role: ProjectRole;
  content: string;
  createdAt: Date;
}

export interface ProjectItem {
  id: string;
  projectId: string;
  userId: string;
  kind: ItemKind;
  title: string;
  detail: string | null;
  status: ItemStatus;
  source: ItemSource;
  createdAt: Date;
  updatedAt: Date;
}

export type TurnProposal = { id: string; kind: ItemKind; title: string; detail: string | null };

export type TurnEvent =
  | { type: "turn-started" }
  | { type: "say"; text: string; index: number }
  | { type: "proposal"; proposal: TurnProposal; index: number }
  | { type: "turn-finished"; status: "ok" | "empty"; costCents: number | null }
  | { type: "turn-error"; code: "llm_disabled" | "llm_failed" | "persist_failed" };
