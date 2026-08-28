"use server";

import { z } from "zod";

import { createProject, deleteProjectForUser } from "@factory/brainstorm";
import { ApiError, defineAction } from "@factory/core";

export const createProjectAction = defineAction({
  auth: "required",
  input: z.object({
    name: z.string().trim().min(1).max(80),
    pitch: z.string().trim().max(200).optional(),
  }),
  rateLimit: { name: "brainstorm-create-project", windowSeconds: 60, max: 10 },
  action: async ({ session, input }) => {
    const project = await createProject(session.user.id, input.name, input.pitch ?? null);
    return { id: project.id } as const;
  },
});

export const deleteProjectAction = defineAction({
  auth: "required",
  input: z.object({ projectId: z.uuid() }),
  action: async ({ session, input }) => {
    const deleted = await deleteProjectForUser(input.projectId, session.user.id);
    if (!deleted) {
      throw new ApiError(404, "project_not_found", "That project is gone already.");
    }
    return { deleted: true } as const;
  },
});
