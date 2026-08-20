import tseslint from "typescript-eslint";
import eslintConfigPrettier from "eslint-config-prettier";

// ---------------------------------------------------------------------------------------
// Inline "factory" plugin (design spec §8.4, plan D.5 + D.9.3): two enforcement rules that
// make the safe way the only way that compiles and lints.
//
//   - factory/no-raw-handler — kills raw Next.js route handlers and raw "use server"
//     exports. The only legal way to export an HTTP method from a route file, or a value
//     from a "use server" file, is a direct `defineHandler(...)` / `defineAction(...)`
//     call (or the one documented framework-mount exception).
//   - factory/no-process-env — kills direct `process.env` reads outside the handful of
//     files that are explicitly allowed to own env parsing.
//
// Both are written as a small inline ESLint plugin object (ESLint 10 flat config supports
// `plugins: { factory: { rules: {...} } }` directly) rather than `no-restricted-syntax`
// selectors — the raw-handler rule's "CallExpression-initializer-only, callee-identity"
// checks are precise AST logic that a single selector can't express cleanly (plan D.1).
// ---------------------------------------------------------------------------------------

const HTTP_METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]);

/** Normalizes a filename to forward slashes for portable suffix/regex matching. */
function normalize(filename) {
  return filename.replace(/\\/g, "/");
}

/**
 * apps/<name>/app/**\/route.{ts,tsx,js,jsx,mjs,cjs} (plan D.5: "in apps/*\/app/**\/route.ts"),
 * also matching the `src/app` layout, and every JS/TS route-file extension Next.js accepts
 * — not just `.ts` (D.9 bypass fix: `route.js`/`route.mjs` used to escape this check
 * entirely).
 */
function isRouteFile(filename) {
  return /\/apps\/[^/]+\/(?:src\/)?app\/.*\/route\.(ts|tsx|js|jsx|mjs|cjs)$/.test(
    normalize(filename),
  );
}

/**
 * Allowlisted framework-mount files (plan D.9.3(e), generalized in G.10.11): routes
 * that are not handlers we write — each destructures exactly its framework's documented
 * factory call. Adding a mount = one entry here; the check and the error message both
 * read this table.
 */
const FRAMEWORK_MOUNTS = [
  // Better Auth catch-all: `export const { GET, POST } = toNextJsHandler(auth)`.
  { fileSuffix: "apps/web/app/api/auth/[...all]/route.ts", callee: "toNextJsHandler" },
  // Inngest serve mount: `export const { GET, POST, PUT } = serve({ client, functions })`.
  { fileSuffix: "apps/web/app/api/inngest/route.ts", callee: "serve" },
];

function frameworkMountFor(filename) {
  const normalized = normalize(filename);
  return FRAMEWORK_MOUNTS.find((mount) => normalized.endsWith(mount.fileSuffix)) ?? null;
}

/**
 * Detects a leading `"use server"` directive prologue. Directives can't be targeted by
 * `files` globs (they're a runtime/parse-time fact, not a path fact), so the rule itself
 * inspects `program.body[0]` — exactly the shape plan D.9.3 prescribes. Handles both the
 * `directive` property some parsers attach and a plain leading string-literal statement.
 */
function hasUseServerDirective(program) {
  const first = program.body[0];
  if (!first || first.type !== "ExpressionStatement") return false;
  if (typeof first.directive === "string") return first.directive === "use server";
  const expr = first.expression;
  return Boolean(expr && expr.type === "Literal" && expr.value === "use server");
}

/** True iff `node` is `<callee>(...)` where `<callee>` is exactly the bare identifier `name`. */
function isCallToIdentifier(node, name) {
  return Boolean(
    node &&
    node.type === "CallExpression" &&
    node.callee.type === "Identifier" &&
    node.callee.name === name,
  );
}

/** Exported (or specifier) name as a string, from an Identifier or a string Literal key. */
function staticName(node) {
  if (!node) return null;
  if (node.type === "Identifier") return node.name;
  if (node.type === "Literal" && typeof node.value === "string") return node.value;
  return null;
}

const noRawHandlerRule = {
  meta: {
    type: "problem",
    docs: {
      description:
        'Route files may only export HTTP methods via defineHandler(...); "use server" files may only export defineAction(...) calls (design spec §8.4, plan D.9.3).',
    },
    schema: [],
    messages: {
      exportStar:
        "`export * from` is forbidden in route files — it can silently re-export a raw HTTP method handler (plan D.9.3(a)).",
      specifierMethod:
        "`{{name}}` may not be exported via an export specifier (local or re-export) — only `export const {{name}} = defineHandler(...)` is legal (plan D.9.3(b)).",
      rawFunction:
        "`export async function {{name}}` is forbidden — export `{{name}}` as `defineHandler(...)` instead (plan D.9.3(c)).",
      rawInitializer:
        "`export const {{name}} = ...` must initialize directly with a `defineHandler(...)` call — no other expression is legal (plan D.9.3(c)/(d)).",
      aliasedCallee:
        "`{{name}}` must be initialized with a direct call to the `defineHandler` identifier — aliasing (e.g. `const dh = defineHandler; ... = dh(...)`) is forbidden; the canonical call form is the point (plan D.9.3(d)).",
      badDestructure:
        "This destructuring export of an HTTP method is not a registered framework mount. Only the files listed in FRAMEWORK_MOUNTS (eslint.config.mjs) may destructure their documented factory call — shorthand properties, `const`, exact callee (plan D.9.3(e)/G.10.11).",
      badArrayDestructure:
        "`{{name}}` may not be exported via array-destructuring — this is not a legal `defineHandler(...)` call form. Export it as `export const {{name}} = defineHandler(...)` instead (plan D.9.3(b)).",
      nonConstMethod:
        "`{{name}}` must be declared with `const` — `let`/`var` allow reassigning the binding away from its `defineHandler(...)` call after export, defeating this check entirely (plan D.9.3(d)).",
      rawAction:
        '"use server" exports must be direct `defineAction(...)` calls — `{{name}}` is not (design spec §8.4, plan D.9.3).',
      rawActionExportStar:
        '`export * from` is forbidden in "use server" files — every export must be a visible `defineAction(...)` call.',
      rawActionSpecifier:
        '`{{name}}` may not leave a "use server" file via an export specifier (local or re-export) — only `export const {{name}} = defineAction(...)` is legal.',
    },
  },
  create(context) {
    const filename = context.filename ?? context.getFilename();
    const routeFile = isRouteFile(filename);
    const frameworkMount = routeFile ? frameworkMountFor(filename) : null;
    let actionFile = false;

    /** Route-file check for one `export const X = ...` / destructuring declarator. */
    function checkRouteDeclarator(declarator, kind) {
      const id = declarator.id;

      if (id.type === "ArrayPattern") {
        // `export const [GET] = [async () => ...]` — array-destructuring an HTTP method
        // out of an arbitrary expression is never a legal `defineHandler(...)` call form,
        // regardless of what's on the right-hand side (D.9 bypass fix).
        const methodElements = id.elements.filter((el) => {
          const name = staticName(el && el.type === "AssignmentPattern" ? el.left : el);
          return name && HTTP_METHODS.has(name);
        });
        if (methodElements.length === 0) return;
        const first = methodElements[0];
        const name = staticName(first.type === "AssignmentPattern" ? first.left : first);
        context.report({ node: declarator, messageId: "badArrayDestructure", data: { name } });
        return;
      }

      if (id.type === "ObjectPattern") {
        // Check each property's BOUND VALUE identifier, not its key: `{ handler: GET }`
        // exports the local binding `GET` (must be checked), while `{ GET: foo }` exports
        // the local binding `foo` (not a method name, not our concern here). Shorthand
        // `{ GET, POST }` has key === value, so this naturally covers the allowlisted form
        // too (D.9 bypass fix).
        const methodProps = id.properties.filter((p) => {
          if (p.type !== "Property") return false;
          const valueNode = p.value.type === "AssignmentPattern" ? p.value.left : p.value;
          const valueName = staticName(valueNode);
          return valueName && HTTP_METHODS.has(valueName);
        });
        if (methodProps.length === 0) return;

        const allShorthand = methodProps.every((p) => p.shorthand);
        if (
          frameworkMount &&
          kind === "const" &&
          allShorthand &&
          isCallToIdentifier(declarator.init, frameworkMount.callee)
        ) {
          return; // exactly this mount's documented exception (FRAMEWORK_MOUNTS above).
        }
        context.report({ node: declarator, messageId: "badDestructure" });
        return;
      }

      if (id.type !== "Identifier" || !HTTP_METHODS.has(id.name)) return;

      if (kind !== "const") {
        context.report({ node: declarator, messageId: "nonConstMethod", data: { name: id.name } });
        return;
      }

      if (isCallToIdentifier(declarator.init, "defineHandler")) return;

      if (
        declarator.init &&
        declarator.init.type === "CallExpression" &&
        declarator.init.callee.type === "Identifier"
      ) {
        // A call, but not to the bare `defineHandler` identifier — e.g. an alias.
        context.report({ node: declarator, messageId: "aliasedCallee", data: { name: id.name } });
        return;
      }

      context.report({ node: declarator, messageId: "rawInitializer", data: { name: id.name } });
    }

    /** "use server" file check for one `export const X = ...` declarator. */
    function checkActionDeclarator(declarator) {
      const id = declarator.id;
      const name = id.type === "Identifier" ? id.name : "<destructured>";
      if (isCallToIdentifier(declarator.init, "defineAction")) return;
      context.report({ node: declarator, messageId: "rawAction", data: { name } });
    }

    return {
      Program(node) {
        actionFile = hasUseServerDirective(node);
      },

      ExportAllDeclaration(node) {
        if (routeFile) {
          context.report({ node, messageId: "exportStar" });
        } else if (actionFile) {
          context.report({ node, messageId: "rawActionExportStar" });
        }
      },

      ExportNamedDeclaration(node) {
        if (!routeFile && !actionFile) return;

        // `export { x as GET }` / `export { GET } from "./other"` — always forbidden,
        // in both route files (D.9.3(b)) and "use server" files: the export site never
        // shows a visible defineHandler/defineAction call.
        if (node.specifiers.length > 0) {
          for (const specifier of node.specifiers) {
            const exportedName = staticName(specifier.exported);
            if (routeFile && exportedName && HTTP_METHODS.has(exportedName)) {
              context.report({
                node: specifier,
                messageId: "specifierMethod",
                data: { name: exportedName },
              });
            } else if (actionFile) {
              context.report({
                node: specifier,
                messageId: "rawActionSpecifier",
                data: { name: exportedName ?? "<export>" },
              });
            }
          }
          return;
        }

        const declaration = node.declaration;
        if (!declaration) return;

        if (declaration.type === "FunctionDeclaration") {
          const name = declaration.id?.name;
          if (routeFile && name && HTTP_METHODS.has(name)) {
            context.report({ node: declaration, messageId: "rawFunction", data: { name } });
          } else if (actionFile) {
            context.report({
              node: declaration,
              messageId: "rawAction",
              data: { name: name ?? "<function>" },
            });
          }
          return;
        }

        if (declaration.type === "VariableDeclaration") {
          for (const declarator of declaration.declarations) {
            if (routeFile) checkRouteDeclarator(declarator, declaration.kind);
            else if (actionFile) checkActionDeclarator(declarator);
          }
          return;
        }

        // Any other declaration form (class, enum, interface, type alias exporting a
        // method-named binding, etc.) exporting an HTTP method / living in an action file
        // is not a CallExpression and is therefore always illegal here.
        const name = declaration.id?.name;
        if (routeFile && name && HTTP_METHODS.has(name)) {
          context.report({ node: declaration, messageId: "rawInitializer", data: { name } });
        } else if (actionFile && name) {
          context.report({ node: declaration, messageId: "rawAction", data: { name } });
        }
      },

      ExportDefaultDeclaration(node) {
        if (!actionFile) return;
        if (isCallToIdentifier(node.declaration, "defineAction")) return;
        context.report({ node, messageId: "rawAction", data: { name: "default" } });
      },
    };
  },
};

const noProcessEnvRule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow direct process.env access outside the files responsible for parsing it (design spec §8.4, plan D.5).",
    },
    schema: [],
    messages: {
      noProcessEnv:
        'Direct process.env access is forbidden here. Import env/capabilities from "@factory/config" (app code) or "@factory/config/node" (package scripts) instead.',
    },
  },
  create(context) {
    return {
      MemberExpression(node) {
        if (node.object.type !== "Identifier" || node.object.name !== "process") return;
        const propName =
          !node.computed && node.property.type === "Identifier"
            ? node.property.name
            : node.property.type === "Literal" && typeof node.property.value === "string"
              ? node.property.value
              : null;
        if (propName === "env") {
          context.report({ node, messageId: "noProcessEnv" });
        }
      },
    };
  },
};

const factoryPlugin = {
  rules: {
    "no-raw-handler": noRawHandlerRule,
    "no-process-env": noProcessEnvRule,
  },
};

// Every registered env var name is expected to route through packages/config. These are
// the ONLY places allowed to touch `process.env` directly (plan D.5/D.9):
//   - packages/config/src/**      the registry's own zod parse + merged-env primitives
//   - packages/config/scripts/**  doctor's own env read (mirrors src's merge logic)
//   - packages/db/scripts/**      migrate.ts/seed.ts — argv/exit-code checks, and any
//                                 direct env reads there are pre-readMergedEnv bootstrap
//   - **/test/**, **/*.test.*     test code builds its own env/DB fixtures
//   - **/vitest.config.*          test runner config, not app/script code
//   - **/next.config.*            build-time Next config, not app/script code
//   - .dependency-cruiser.cjs     boundary-tool config, not app/script code
const PROCESS_ENV_EXCEPTIONS = [
  "packages/config/src/**",
  "packages/config/scripts/**",
  "packages/db/scripts/**",
  "**/test/**",
  "**/*.test.*",
  "**/vitest.config.*",
  "**/next.config.*",
  ".dependency-cruiser.cjs",
];

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/.next/**",
      "**/coverage/**",
      ".husky/**",
      "pnpm-lock.yaml",
      // Generated by Next.js; its triple-slash references are not ours to style.
      "**/next-env.d.ts",
    ],
  },
  ...tseslint.configs.recommended,
  eslintConfigPrettier,

  // Raw-handler ban: scoped to source under apps/ and packages/ (route files live under
  // apps/*/app/**; "use server" files could live anywhere in app or package source, and
  // the directive check inside the rule is what actually decides whether it applies).
  {
    // Every JS/TS extension Next.js accepts for a route handler, and every extension a
    // "use server" file could plausibly use — not just `.ts`/`.tsx` (D.9 bypass fix:
    // `route.js`/`route.mjs` used to escape the rule entirely because ESLint never even
    // ran it against those files).
    files: [
      "apps/**/*.ts",
      "apps/**/*.tsx",
      "apps/**/*.js",
      "apps/**/*.jsx",
      "apps/**/*.mjs",
      "apps/**/*.cjs",
      "packages/**/*.ts",
      "packages/**/*.tsx",
      "packages/**/*.js",
      "packages/**/*.jsx",
      "packages/**/*.mjs",
      "packages/**/*.cjs",
    ],
    plugins: { factory: factoryPlugin },
    rules: {
      "factory/no-raw-handler": "error",
    },
  },

  // process.env ban: everywhere, minus the documented exceptions below.
  {
    files: ["**/*.ts", "**/*.tsx", "**/*.mts", "**/*.cts", "**/*.mjs", "**/*.cjs"],
    plugins: { factory: factoryPlugin },
    rules: {
      "factory/no-process-env": "error",
    },
  },
  {
    files: PROCESS_ENV_EXCEPTIONS,
    plugins: { factory: factoryPlugin },
    rules: {
      "factory/no-process-env": "off",
    },
  },
);
