/**
 * Task-capture domain constants (milestone 11, plan K.5.6). This is the "renameable"
 * half of the M11 split (K.1.3) — `make-it-yours` Phase 2 deletes/renames this file with
 * the rest of `packages/untangle/src/tasks/`, unlike `packages/untangle/src/runs/`, which
 * is inherited verbatim.
 */

/** 'now' | 'next' | 'later' | untriaged (`null` on the row). Re-exported from
 * `packages/untangle/src/index.ts` (K.14 "Nits folded"). */
export type Priority = "now" | "next" | "later";

/** Cap on `captures.raw_text` after normalization — also the request body cap `POST
 * /api/runs`'s zod schema enforces (T8). */
export const MAX_CAPTURE_CHARS = 20_000;

/** Cap on tasks extracted from a single capture, LLM or heuristic path alike. */
export const MAX_TASKS_PER_RUN = 30;

/** Cap on subtasks produced per parent task by the `decompose` step. */
export const MAX_SUBTASKS_PER_TASK = 8;

/** A heuristic-extracted fragment shorter than this (after trimming markers/whitespace)
 * is dropped as noise, not stored as a task. */
export const MIN_TASK_CHARS = 3;

/** Cap on `tasks.title`. */
export const MAX_TITLE_CHARS = 200;

/** Cap on `tasks.tag`. */
export const MAX_TAG_CHARS = 24;

/** `safeFetch` byte cap for the paste-a-URL capture path (`POST /api/runs`, T8). */
export const URL_FETCH_MAX_BYTES = 1_048_576;

/** `safeFetch` timeout for the paste-a-URL capture path (`POST /api/runs`, T8). */
export const URL_FETCH_TIMEOUT_MS = 10_000;
