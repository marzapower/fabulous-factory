import { toNextJsHandler } from "better-auth/next-js";

import { auth } from "@factory/auth";

// Allowlisted framework mount (plan D.9.3(e)): the raw-handler lint rule forbids every
// other form of exporting GET/POST from a route file, but this exact destructure —
// `{ GET, POST } = toNextJsHandler(auth)` on this exact file — is the one documented
// exception. Better Auth owns request handling internally; there is no handler body here
// for defineHandler to wrap.
export const { GET, POST } = toNextJsHandler(auth);
