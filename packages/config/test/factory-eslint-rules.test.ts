import { RuleTester } from "eslint";
import tseslint from "typescript-eslint";
import { describe, it } from "vitest";

// Relative import, deliberately NOT a package specifier — this test drives the actual repo
// root's `eslint.factory-rules.mjs` module (the same file `eslint.config.mjs` wires up),
// proving the plugin extraction is behavior-preserving. See that module's own header
// comment for the four bypass fixes (B1-B4) this suite exercises.
import { factoryPlugin } from "../../../eslint.factory-rules.mjs";

// RuleTester auto-detects Mocha-style globals; wiring it to vitest's describe/it explicitly
// (the documented escape hatch, ESLint docs "Using a Test Runner") is what lets this run
// under `vitest run` without a global `describe`/`it` (this repo's vitest.config.ts does not
// set `test.globals: true`).
RuleTester.describe = describe;
RuleTester.it = it;

const ruleTester = new RuleTester({
  languageOptions: {
    parser: tseslint.parser,
    sourceType: "module",
    ecmaVersion: "latest",
  },
});

const CORE_IMPORT = 'import { defineHandler, defineAction } from "@factory/core";\n';

// `isRouteFile`/`FRAMEWORK_MOUNTS` match against `\/apps\/...` — real ESLint always hands
// the rule an ABSOLUTE filename (leading slash), so every `filename` below is given a
// leading `/` to match that real-world shape, even though it isn't a full filesystem path.

// -----------------------------------------------------------------------------------------
// factory/no-raw-handler
// -----------------------------------------------------------------------------------------

ruleTester.run("factory/no-raw-handler", factoryPlugin.rules["no-raw-handler"], {
  valid: [
    {
      name: "legal defineHandler const export",
      filename: "/apps/web/app/api/foo/route.ts",
      code: `${CORE_IMPORT}export const GET = defineHandler({ handler: async () => ({ ok: true }) });`,
    },
    {
      // B2: apps/<name>/app/route.ts (the app-root route file, zero segments under app/) is
      // now itself recognized as a route file — and a legal defineHandler export there
      // must still pass.
      name: "B2: legal defineHandler at the app-root route file",
      filename: "/apps/web/app/route.ts",
      code: `${CORE_IMPORT}export const GET = defineHandler({ handler: async () => ({ ok: true }) });`,
    },
    {
      name: "legal Better Auth FRAMEWORK_MOUNTS destructure, real import",
      filename: "/apps/web/app/api/auth/[...all]/route.ts",
      code: `import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "../../../../lib/auth";
export const { GET, POST } = toNextJsHandler(auth);`,
    },
    {
      name: "legal Inngest FRAMEWORK_MOUNTS destructure, real import",
      filename: "/apps/web/app/api/inngest/route.ts",
      code: `import { serve } from "inngest/next";
import { inngest } from "@factory/jobs";
export const { GET, POST, PUT } = serve({ client: inngest, functions: [] });`,
    },
    {
      name: "non-route file is untouched by raw exports of HTTP-method-named bindings",
      filename: "/apps/web/lib/http-methods.ts",
      code: `export const GET = async () => ({ ok: true });
export function POST() {}
export * from "./other";`,
    },
    {
      name: 'legal defineAction file (Program-level "use server")',
      filename: "/apps/web/app/foo/actions.ts",
      code: `"use server";\n${CORE_IMPORT}export const doThing = defineAction({ action: async () => ({ ok: true }) });`,
    },
    {
      // B3 valid counterpart: a plain nested function with NO directive of its own must
      // never be flagged just because the enclosing file has a Program-level directive.
      name: 'B3: a Program-level "use server" directive is legal, and a directive-less nested function inside it is not flagged',
      filename: "/apps/web/app/foo/actions.ts",
      code: `"use server";
${CORE_IMPORT}export const doThing = defineAction({
  action: async () => {
    function helper() {
      return 1;
    }
    return helper();
  },
});`,
    },
    {
      name: "export * from is untouched outside a route/action file",
      filename: "/apps/web/lib/reexport.ts",
      code: `export * from "./other";`,
    },
  ],
  invalid: [
    {
      // B1: the callee is literally named `defineHandler`, but it resolves (via scope
      // analysis) to an import from the WRONG module — not "@factory/core" — so it must be
      // reported, not silently accepted just because the name matches.
      name: "B1: defineHandler imported from the wrong module is a shadowedCallee",
      filename: "/apps/web/app/api/foo/route.ts",
      code: `import { defineHandler } from "./local-shim";
export const GET = defineHandler({ handler: async () => ({ ok: true }) });`,
      errors: [
        { messageId: "shadowedCallee", data: { name: "defineHandler", source: "@factory/core" } },
      ],
    },
    {
      // B1: no import at all — `defineHandler` resolves to a same-named local function
      // declaration (the shadowing case named in the task).
      name: "B1: defineHandler with no import at all (local declaration shadow)",
      filename: "/apps/web/app/api/foo/route.ts",
      code: `function defineHandler(opts: unknown) {
  return opts;
}
export const GET = defineHandler({ handler: async () => ({ ok: true }) });`,
      errors: [
        { messageId: "shadowedCallee", data: { name: "defineHandler", source: "@factory/core" } },
      ],
    },
    {
      // B1: the Inngest mount's `serve` resolves to the wrong module — same fix applied to
      // the FRAMEWORK_MOUNTS destructure path, not just the plain defineHandler path.
      name: "B1: shadowed serve() in the Inngest mount path",
      filename: "/apps/web/app/api/inngest/route.ts",
      code: `import { serve } from "./not-inngest";
import { inngest } from "@factory/jobs";
export const { GET, POST, PUT } = serve({ client: inngest, functions: [] });`,
      errors: [{ messageId: "shadowedCallee", data: { name: "serve", source: "inngest/next" } }],
    },
    {
      // B2: apps/<name>/app/route.ts (the app-root route file) previously escaped
      // isRouteFile entirely — a raw handler there must now be caught.
      name: "B2: raw handler at the app-root route file",
      filename: "/apps/web/app/route.ts",
      code: `export async function GET() {
  return Response.json({ ok: true });
}`,
      errors: [{ messageId: "rawFunction", data: { name: "GET" } }],
    },
    {
      // .mts route files must be covered too — matching no-process-env's extension
      // coverage, not just .ts/.tsx/.js/.jsx/.mjs/.cjs.
      name: "a raw handler in a .mts route file is caught",
      filename: "/apps/web/app/api/foo/route.mts",
      code: `export async function GET() {
  return Response.json({ ok: true });
}`,
      errors: [{ messageId: "rawFunction", data: { name: "GET" } }],
    },
    {
      // B3: a "use server" directive inside a nested function's OWN body, in an ordinary
      // page-like file (not a route file, no Program-level directive) — must be caught.
      name: 'B3: inline "use server" inside a nested function in a page-like file',
      filename: "/apps/web/app/foo/page.tsx",
      code: `export default function Page() {
  async function submit() {
    "use server";
    return { ok: true };
  }
  return null;
}`,
      errors: [{ messageId: "inlineServerAction" }],
    },
    {
      // B3: same, for an arrow function body with its own directive.
      name: 'B3: inline "use server" inside an arrow function body',
      filename: "/apps/web/app/foo/page.tsx",
      code: `export default function Page() {
  const submit = async () => {
    "use server";
    return { ok: true };
  };
  return null;
}`,
      errors: [{ messageId: "inlineServerAction" }],
    },
    {
      name: "pre-existing: export * from is forbidden in a route file",
      filename: "/apps/web/app/api/foo/route.ts",
      code: `export * from "./other";`,
      errors: [{ messageId: "exportStar" }],
    },
    {
      name: "pre-existing: export specifier / re-export of an HTTP method",
      filename: "/apps/web/app/api/foo/route.ts",
      code: `export { GET } from "./other";`,
      errors: [{ messageId: "specifierMethod", data: { name: "GET" } }],
    },
    {
      name: "pre-existing: array-destructuring an HTTP method export",
      filename: "/apps/web/app/api/foo/route.ts",
      code: `export const [GET] = [async () => ({ ok: true })];`,
      errors: [{ messageId: "badArrayDestructure", data: { name: "GET" } }],
    },
    {
      name: "pre-existing: object-destructuring an HTTP method export, not a registered mount",
      filename: "/apps/web/app/api/foo/route.ts",
      code: `export const { GET } = { GET: async () => ({ ok: true }) };`,
      errors: [{ messageId: "badDestructure" }],
    },
    {
      name: "pre-existing: let/var declared HTTP method export",
      filename: "/apps/web/app/api/foo/route.ts",
      code: `${CORE_IMPORT}export let GET = defineHandler({ handler: async () => ({ ok: true }) });`,
      errors: [{ messageId: "nonConstMethod", data: { name: "GET" } }],
    },
    {
      name: "pre-existing: aliased callee (bound to a non-canonical local name) stays illegal",
      filename: "/apps/web/app/api/foo/route.ts",
      code: `${CORE_IMPORT}const dh = defineHandler;
export const GET = dh({ handler: async () => ({ ok: true }) });`,
      errors: [{ messageId: "aliasedCallee", data: { name: "GET" } }],
    },
    {
      name: "pre-existing: raw async function export in a route file",
      filename: "/apps/web/app/api/foo/route.ts",
      code: `export async function GET() {
  return Response.json({ ok: true });
}`,
      errors: [{ messageId: "rawFunction", data: { name: "GET" } }],
    },
    {
      name: "pre-existing: non-call initializer in a route file",
      filename: "/apps/web/app/api/foo/route.ts",
      code: `export const GET = async () => ({ ok: true });`,
      errors: [{ messageId: "rawInitializer", data: { name: "GET" } }],
    },
    {
      name: 'pre-existing: "use server" file — raw (non-defineAction) export',
      filename: "/apps/web/app/foo/actions.ts",
      code: `"use server";
export const doThing = async () => ({ ok: true });`,
      errors: [{ messageId: "rawAction", data: { name: "doThing" } }],
    },
    {
      name: 'pre-existing: "use server" file — export * from is forbidden',
      filename: "/apps/web/app/foo/actions.ts",
      code: `"use server";
export * from "./other";`,
      errors: [{ messageId: "rawActionExportStar" }],
    },
    {
      name: 'pre-existing: "use server" file — export specifier is forbidden',
      filename: "/apps/web/app/foo/actions.ts",
      code: `"use server";
const doThing = async () => ({ ok: true });
export { doThing };`,
      errors: [{ messageId: "rawActionSpecifier", data: { name: "doThing" } }],
    },
    {
      // B1 for the action-file path: defineAction resolves to the wrong module.
      name: "B1: defineAction imported from the wrong module is a shadowedCallee",
      filename: "/apps/web/app/foo/actions.ts",
      code: `"use server";
import { defineAction } from "./local-shim";
export const doThing = defineAction({ action: async () => ({ ok: true }) });`,
      errors: [
        { messageId: "shadowedCallee", data: { name: "defineAction", source: "@factory/core" } },
      ],
    },
    {
      name: 'pre-existing: "use server" file — raw default export',
      filename: "/apps/web/app/foo/actions.ts",
      code: `"use server";
export default async function doThing() {
  return { ok: true };
}`,
      errors: [{ messageId: "rawAction", data: { name: "default" } }],
    },
  ],
});

// -----------------------------------------------------------------------------------------
// factory/no-process-env
// -----------------------------------------------------------------------------------------

ruleTester.run("factory/no-process-env", factoryPlugin.rules["no-process-env"], {
  valid: [
    {
      name: "unrelated process member access (not .env) is untouched",
      code: "process.exit(1);",
    },
    {
      name: "B4: a genuinely local variable named process is not flagged as an alias (scope-resolved)",
      code: `function foo() {
  const process = { env: {} };
  const p = process;
  return p;
}`,
    },
  ],
  invalid: [
    {
      name: "pre-existing: bare process.env member access",
      code: "console.log(process.env.FOO);",
      errors: [{ messageId: "noProcessEnv" }],
    },
    {
      name: "B4(i): globalThis.process.env",
      code: "console.log(globalThis.process.env.FOO);",
      errors: [{ messageId: "noProcessEnv" }],
    },
    {
      name: "B4(i): global.process.env",
      code: "console.log(global.process.env.FOO);",
      errors: [{ messageId: "noProcessEnv" }],
    },
    {
      name: "B4(ii): aliasing the bare global process identifier",
      code: "const p = process;",
      errors: [{ messageId: "processAlias" }],
    },
    {
      name: "B4(ii): aliasing process via globalThis.process reports on the declarator",
      code: "const p = globalThis.process; p.env.X;",
      errors: [{ messageId: "processAlias" }],
    },
    {
      name: "B4(ii): destructuring env off globalThis.process is also an alias",
      code: "const { env } = globalThis.process;",
      errors: [{ messageId: "processAlias" }],
    },
    {
      name: 'B4(iii): importing from "process"',
      code: 'import proc from "process";',
      errors: [{ messageId: "processImport", data: { source: "process" } }],
    },
    {
      name: 'B4(iii): importing from "node:process"',
      code: 'import { env } from "node:process";',
      errors: [{ messageId: "processImport", data: { source: "node:process" } }],
    },
  ],
});
