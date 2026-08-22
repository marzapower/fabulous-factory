import "server-only";

// --- runs/engine ---------------------------------------------------------------------
export {
  runPipeline,
  type RunStatus,
  type StepStatus,
  type StepSource,
  type RunStepContext,
  type RunStepResult,
  type RunStep,
  type RunDriver,
  type RunEvent,
  type RunSummary,
} from "./runs/engine";

// --- runs/drivers ----------------------------------------------------------------------
export { inlineDriver, durableDriver } from "./runs/drivers";

// --- runs/queries ----------------------------------------------------------------------
export {
  createRun,
  upsertRunStep,
  finishRunStep,
  finishRun,
  countRunsToday,
  listRunsForUser,
  getRunForUser,
  type RunListItem,
  type RunDetail,
  type RunStepRow,
} from "./runs/queries";

// --- runs/constants ----------------------------------------------------------------------
export {
  RUN_HARD_CEILING_PER_DAY,
  RUN_STALE_AFTER_MS,
  runLimitMessage,
  dailyCeilingMessage,
  isStaleRun,
} from "./runs/constants";

// --- tasks/pipeline ----------------------------------------------------------------------
export { capturePipeline, type CaptureState, type TaskEvent } from "./tasks/pipeline";

// --- tasks/daily-plan ----------------------------------------------------------------------
export { dailyPlanPipeline, type DailyPlanState } from "./tasks/daily-plan";

// --- tasks/queries ----------------------------------------------------------------------
export {
  createCapture,
  insertExtractedTask,
  applyTriage,
  insertSubtasks,
  listTasksForUser,
  listOpenTasksForUser,
  setTaskStatus,
  createManualTask,
  deleteTaskRow,
  type TaskTree,
  type TaskListItem,
} from "./tasks/queries";

// --- tasks/normalize ----------------------------------------------------------------------
export { normalizeContent } from "./tasks/normalize";

// --- tasks/constants ----------------------------------------------------------------------
export {
  MAX_CAPTURE_CHARS,
  MAX_TASKS_PER_RUN,
  MAX_SUBTASKS_PER_TASK,
  MAX_TITLE_CHARS,
  URL_FETCH_MAX_BYTES,
  URL_FETCH_TIMEOUT_MS,
  type Priority,
} from "./tasks/constants";

// --- events ----------------------------------------------------------------------
export { DAILY_PLAN_EVENT } from "./events";

// --- functions ----------------------------------------------------------------------
export { functions } from "./functions";

// --- client ----------------------------------------------------------------------
export { inngest } from "./client";
