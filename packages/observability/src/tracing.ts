import { trace } from "@opentelemetry/api";

/**
 * The OTel tracer seam described by spec §5.4 ("Telemetry: emits OpenTelemetry spans;
 * any OTel backend ... can consume them") and scoped by plan E.3/E.9: this package ships
 * `@opentelemetry/api` ONLY — no SDK, no exporter, no provider registration.
 *
 * `trace.getTracer("factory")` is a documented no-op until some other code registers a
 * global TracerProvider (an SDK import, e.g. `@opentelemetry/sdk-trace-node` wired by an
 * adopter, or M5's `packages/llm`). Until then every span this tracer creates is a
 * `NonRecordingSpan`: `startActiveSpan` still invokes its callback synchronously and
 * forwards the callback's return value, but `span.isRecording()` is `false` and nothing
 * is exported anywhere. That makes this import completely free at runtime — safe to
 * import from any server module regardless of whether observability is configured.
 *
 * Wiring a real provider (and thereby making these spans live) is explicitly a
 * guide-only follow-up (`docs/guides/llm-observability.md`, per plan E.0), not something
 * this package ships.
 */
export const tracer = trace.getTracer("factory");
