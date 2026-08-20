import type { ZodError } from "zod";

export interface ApiErrorIssue {
  path: (string | number)[];
  message: string;
}

/** zod's `ZodIssue.path` is typed `PropertyKey[]` (a symbol is possible in principle,
 * though never actually produced for JSON-shaped input); normalize defensively so the
 * issue list stays cleanly JSON-serializable. */
function normalizePathSegment(segment: PropertyKey): string | number {
  return typeof segment === "symbol" ? segment.toString() : segment;
}

export interface ApiErrorDetails {
  issues?: ApiErrorIssue[];
  [key: string]: unknown;
}

/**
 * Typed application error (plan D.4). Thrown from inside `defineHandler`/`defineAction`
 * — by the wrapper itself (auth/rate-limit/origin/input failures) or by a handler/action
 * body — and shaped into a response by `shapeError`. `headers` lets a call site attach
 * response headers (e.g. `Retry-After` on a 429) without a separate mechanism.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: ApiErrorDetails;
  readonly headers?: Record<string, string>;

  constructor(
    status: number,
    code: string,
    message?: string,
    details?: ApiErrorDetails,
    headers?: Record<string, string>,
  ) {
    super(message ?? code);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
    this.headers = headers;
  }

  toResponse(): Response {
    const body: { error: { code: string; message: string; details?: ApiErrorDetails } } = {
      error: { code: this.code, message: this.message },
    };
    if (this.details !== undefined) {
      body.error.details = this.details;
    }
    return Response.json(body, { status: this.status, headers: this.headers });
  }
}

/**
 * Shapes ANY thrown value into a `Response`. `ApiError` → its own status/code/details;
 * anything else — including a stray `ZodError` thrown from inside a handler/action body
 * (plan D.9.12: that's a bug, not an input-validation failure; the wrapper's own parse
 * step is the only legitimate 400 site, see `zodErrorToApiError`) — becomes an opaque
 * 500, logged server-side via `console.error`, and NEVER leaks the original message or
 * stack to the client.
 */
export function shapeError(err: unknown): Response {
  if (err instanceof ApiError) {
    return err.toResponse();
  }
  console.error("[@factory/core] unhandled error", err);
  return Response.json(
    { error: { code: "internal_error", message: "Internal server error" } },
    { status: 500 },
  );
}

/**
 * Converts the wrapper's own zod parse failure (the one legitimate 400 site, plan
 * D.9.12) into an `ApiError`. Never call this with a `ZodError` caught from inside a
 * handler/action body — that path stays a 500 via `shapeError`'s default case.
 */
export function zodErrorToApiError(error: ZodError): ApiError {
  return new ApiError(400, "invalid_input", "Invalid input", {
    issues: error.issues.map((issue) => ({
      path: issue.path.map(normalizePathSegment),
      message: issue.message,
    })),
  });
}
