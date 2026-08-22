"use server";

import { z } from "zod";

import {
  createItemForUser,
  deleteItemForUser,
  renameProjectForUser,
  updateItemForUser,
} from "@factory/brainstorm";
import { ApiError, defineAction } from "@factory/core";

const projectIdInput = z.object({ projectId: z.uuid() });
const itemIdInput = z.object({ itemId: z.uuid() });

/**
 * Renames a project and/or edits its pitch — both optional so a caller can send just one.
 * `null` for the id (a "not found or not yours" case) is possible because `queries.ts`
 * scopes every update by `(id, userId)`; either the row never existed or it belongs to
 * someone else, and both read the same to the caller (same stance as
 * `apps/untangle/app/dashboard/actions.ts`'s `toggleTaskAction`).
 */
export const renameProjectAction = defineAction({
  auth: "required",
  input: projectIdInput.extend({
    name: z.string().trim().min(1).max(80).optional(),
    pitch: z.string().trim().max(200).optional(),
  }),
  action: async ({ session, input }) => {
    const updated = await renameProjectForUser(input.projectId, session.user.id, {
      name: input.name,
      pitch: input.pitch,
    });
    if (!updated) {
      throw new ApiError(404, "project_not_found", "That project is gone already.");
    }
    return updated;
  },
});

export const addItemAction = defineAction({
  auth: "required",
  input: projectIdInput.extend({
    kind: z.enum(["idea", "feature", "note"]),
    title: z.string().trim().min(1).max(120),
    detail: z.string().trim().max(2000).optional(),
  }),
  rateLimit: { name: "brainstorm-add-item", windowSeconds: 60, max: 30 },
  action: async ({ session, input }) => {
    // Manual adds default to `status: "accepted"` — `createItemForUser` itself applies
    // that default, so it isn't repeated here.
    const item = await createItemForUser(input.projectId, session.user.id, {
      kind: input.kind,
      title: input.title,
      detail: input.detail ?? null,
      source: "manual",
    });
    if (!item) {
      throw new ApiError(404, "project_not_found", "That project is gone already.");
    }
    return item;
  },
});

export const updateItemAction = defineAction({
  auth: "required",
  input: itemIdInput.extend({
    title: z.string().trim().min(1).max(120).optional(),
    detail: z.string().trim().max(2000).optional(),
    kind: z.enum(["idea", "feature", "note"]).optional(),
  }),
  action: async ({ session, input }) => {
    const updated = await updateItemForUser(input.itemId, session.user.id, {
      title: input.title,
      detail: input.detail,
      kind: input.kind,
    });
    if (!updated) {
      throw new ApiError(404, "item_not_found", "That item is gone already.");
    }
    return updated;
  },
});

export const setItemStatusAction = defineAction({
  auth: "required",
  input: itemIdInput.extend({ status: z.enum(["accepted", "dismissed"]) }),
  action: async ({ session, input }) => {
    const updated = await updateItemForUser(input.itemId, session.user.id, {
      status: input.status,
    });
    if (!updated) {
      throw new ApiError(404, "item_not_found", "That item is gone already.");
    }
    return updated;
  },
});

export const deleteItemAction = defineAction({
  auth: "required",
  input: itemIdInput,
  action: async ({ session, input }) => {
    const deleted = await deleteItemForUser(input.itemId, session.user.id);
    if (!deleted) {
      throw new ApiError(404, "item_not_found", "That item is gone already.");
    }
    return { deleted: true } as const;
  },
});
