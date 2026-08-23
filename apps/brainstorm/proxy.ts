import { createAuthProxy } from "@factory/ui/middleware";

// `/dashboard`, `/projects/*` (a project's chat + board) and `/api/chat` (the streaming
// turn route) stay gated — this app has no extra public routes beyond the shared
// allowlist (@factory/ui/middleware) — see that module's doc comment for the full
// optimistic-allowlist rationale (design spec §8.5, plan D.6 + D.9.14).
export const proxy = createAuthProxy();

export const config = {
  matcher: "/((?!_next/static|_next/image|favicon.ico).*)",
};
