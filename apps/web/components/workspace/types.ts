/** Shared shape the workspace renders a task as, regardless of whether it came from the
 * server (`listTasksForUser`'s `TaskTree`, already persisted) or from the live
 * `runReducer` state of a run in progress. Keeping one shape means `TaskCard` never
 * needs to know which source produced the row it's drawing. */
export interface DisplayTask {
  id: string;
  title: string;
  priority: "now" | "next" | "later" | null;
  effortMinutes: number | null;
  dueAt: string | null;
  tag: string | null;
  status: "open" | "done";
  sourceStart: number | null;
  sourceEnd: number | null;
  children: DisplayTask[];
  /** True only for a task that arrived over the wire THIS session — gates the
   * fade+rise entry animation (K.9 "Motion": nothing animates on page load, only
   * a task arriving over the network does). */
  isLive: boolean;
}
