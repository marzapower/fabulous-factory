import { toNextJsHandler } from "better-auth/next-js";

import { auth } from "@factory/auth";

// TODO(M3): fold into the defineHandler enforcement story (framework mount exception).
export const { GET, POST } = toNextJsHandler(auth);
