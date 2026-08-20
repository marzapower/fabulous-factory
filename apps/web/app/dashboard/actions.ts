"use server";

import { z } from "zod";

import { ApiError, defineAction } from "@factory/core";
import {
  checkMonitor,
  createMonitorRow,
  deleteMonitorRow,
  getMonitorForUser,
  recordMonitorError,
  type CheckOutcome,
} from "@factory/jobs";

const createMonitorInput = z.object({
  name: z.string().min(1).max(100),
  // http/https only, enforced at the schema layer (plan G.10.14) — a bad protocol is a
  // validation error here, never an 'error' event from the check pipeline.
  url: z.url({ protocol: /^https?$/ }),
});

/**
 * Auth "required" per plan G.2.10/G.6. `MAX_MONITORS` is enforced inside
 * `createMonitorRow` itself (review fix — a count-then-insert check here would race
 * between concurrent requests), which throws the `monitor_limit_reached` `ApiError`
 * that `defineAction` shapes into the `ActionResult` envelope unchanged. A plain
 * constant cap for this milestone (plan-billing gates land in M7).
 */
export const createMonitorAction = defineAction({
  auth: "required",
  input: createMonitorInput,
  rateLimit: { name: "create-monitor", windowSeconds: 60, max: 10 },
  action: async ({ session, input }) => {
    return createMonitorRow({ userId: session.user.id, name: input.name, url: input.url });
  },
});

const monitorIdInput = z.object({ id: z.uuid() });

export const deleteMonitorAction = defineAction({
  auth: "required",
  input: monitorIdInput,
  action: async ({ session, input }) => {
    const deleted = await deleteMonitorRow(input.id, session.user.id);
    if (!deleted) {
      throw new ApiError(404, "monitor_not_found", "That monitor is gone already.");
    }
    return { deleted: true } as const;
  },
});

/**
 * `checkMonitor` throws on failure and never writes its own 'error' event (plan
 * G.10.5) — this action is the one place a manual check's failure becomes both a
 * recorded event (via `recordMonitorError`) and a typed result the UI can render
 * without a page-wide error boundary.
 *
 * Not exported: the "use server" raw-handler lint rule only allows `defineAction(...)`
 * call exports from this file (design spec §8.4). `components/demo/check-now-button.tsx`
 * redeclares the equivalent shape from `@factory/jobs`'s `CheckOutcome` instead of
 * importing it from here.
 */
type CheckNowResult = CheckOutcome | { status: "error"; summary: string };

export const checkNowAction = defineAction({
  auth: "required",
  input: monitorIdInput,
  rateLimit: { name: "check-now", windowSeconds: 60, max: 6 },
  action: async ({ session, input }): Promise<CheckNowResult> => {
    const monitor = await getMonitorForUser(input.id, session.user.id);
    if (!monitor) {
      throw new ApiError(404, "monitor_not_found", "That monitor is gone already.");
    }

    try {
      return await checkMonitor(input.id);
    } catch (err) {
      const message = err instanceof Error ? err.message : "The check failed.";
      await recordMonitorError(input.id, message);
      return { status: "error", summary: message };
    }
  },
});
