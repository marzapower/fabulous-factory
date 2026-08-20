/**
 * Demo event name + payload (plan G.4). Fired by the cron fan-out
 * (`demo/monitor-cron.ts`) and consumed by the per-monitor worker
 * (`demo/monitor-worker.ts`).
 */
export const MONITOR_CHECK_EVENT = "demo/monitor.check.requested" as const;

export interface MonitorCheckEventData {
  monitorId: string;
}
