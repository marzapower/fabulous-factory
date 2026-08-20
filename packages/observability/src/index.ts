import "server-only";

export { captureException, captureMessage } from "./errors";
export { tracer } from "./tracing";
// Re-exported so consumers of `tracer` (packages/llm, M5) can set span status without
// importing @opentelemetry/api themselves — this package stays the single owner of the
// OTel seam (boundary rule otel-api-only-in-observability).
export { SpanStatusCode } from "@opentelemetry/api";
