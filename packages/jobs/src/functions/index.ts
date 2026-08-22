import type { InngestFunction } from "inngest";

/**
 * Every Inngest function the PRODUCT's own code registers — this is the generic
 * registration point `pnpm gen job` writes new job files beside (see the `add-a-job`
 * skill for the full flow). Deliberately empty in the template/baseline: any preset
 * domain's OWN cron functions (e.g. Untangle's daily-plan cron/worker) ship with that
 * preset's own package and its own `functions` export instead — this array is only ever
 * the product's own jobs, never a preset's.
 *
 * Consumed by the `serve()` route mount (e.g. `apps/untangle`'s
 * `app/api/inngest/route.ts`), typically spread alongside a preset's own registry:
 * `functions: [...productFunctions, ...presetFunctions]`.
 */
export const functions: InngestFunction.Like[] = [];
