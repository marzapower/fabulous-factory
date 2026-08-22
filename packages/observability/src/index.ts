import "server-only";

export { captureException, captureMessage } from "./errors";
export { tracer } from "./tracing";
// Re-exported so consumers of `tracer` (packages/llm, M5) can set span status without
// importing @opentelemetry/api themselves — this package stays the single owner of the
// OTel seam (boundary rule otel-api-only-in-observability).
export { SpanStatusCode } from "@opentelemetry/api";
// Type-only re-export so `packages/llm` (M10) can name the `Span` type its call/stream
// accounting passes across a function boundary, without importing `@opentelemetry/api`
// itself — same precedent as `SpanStatusCode` above.
export type { Span } from "@opentelemetry/api";
