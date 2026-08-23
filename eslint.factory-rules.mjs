// ---------------------------------------------------------------------------------------
// The "factory" ESLint plugin (design spec §8.4, plan D.5 + D.9.3, extracted from
// eslint.config.mjs — see that file's comment for the two rules' purpose). Kept as its own
// module (rather than inline in the flat config) so it can be unit-tested directly via
// ESLint's `Linter`/`RuleTester` (packages/config/test/factory-eslint-rules.test.ts) without
// spinning up the whole flat config. This module ships to every scaffolded product repo
// (packages/create/src/compose.config.ts's BASE_STATIC_ENTRIES) — it is adopter-facing, not
// factory-dev-only.
//
// Hardening over the original inline version (four closed bypasses):
//   B1 — callee-identity checks (defineHandler/defineAction/FRAMEWORK_MOUNTS) now also
//        resolve the callee identifier, via scope analysis, to an IMPORT BINDING from the
//        expected module. A same-named local declaration, parameter, or reassigned var
//        (shadowing the real import) is reported (shadowedCallee), not silently accepted.
//   B2 — isRouteFile now also matches the app-root route file `apps/<name>/app/route.ts`
//        (previously required ≥1 path segment between `app/` and `route.*`).
//   B3 — a `"use server"` directive prologue INSIDE a function body (not the file's
//        Program-level directive) is now itself an error — inline server actions can't
//        hide behind the file-level exemption.
//   B4 — no-process-env now also catches `globalThis.process.env`/`global.process.env`,
//        aliasing the bare global `process` identifier to a new variable, and importing
//        from the `"process"`/`"node:process"` built-in module.
// ---------------------------------------------------------------------------------------

const HTTP_METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]);

/** The one module every canonical `defineHandler`/`defineAction` import must resolve to. */
const CORE_MODULE = "@factory/core";

/** Normalizes a filename to forward slashes for portable suffix/regex matching. */
function normalize(filename) {
  return filename.replace(/\\/g, "/");
}

/**
 * apps/<name>/app/**\/route.{ts,tsx,js,jsx,mjs,cjs,mts,cts} (plan D.5: "in
 * apps/*\/app/**\/route.ts"), also matching the `src/app` layout, the app-ROOT route file
 * `apps/<name>/app/route.ts` (B2 bypass fix — the previous regex required ≥1 segment
 * between `app/` and `route.*` and missed this case entirely), and every JS/TS
 * route-file extension Next.js accepts — not just `.ts` (D.9 bypass fix: `route.js`/
 * `route.mjs` used to escape this check entirely; `.mts`/`.cts` closes the same gap for
 * those two extensions, matching `no-process-env`'s coverage).
 */
function isRouteFile(filename) {
  return /\/apps\/[^/]+\/(?:src\/)?app(?:\/.*)?\/route\.(ts|tsx|js|jsx|mjs|cjs|mts|cts)$/.test(
    normalize(filename),
  );
}

/**
 * Allowlisted framework-mount files (plan D.9.3(e), generalized in G.10.11): routes
 * that are not handlers we write — each destructures exactly its framework's documented
 * factory call. Adding a mount = one entry here; the check and the error message both
 * read this table. `importSource` (B1) is the module the mount's `callee` must itself
 * resolve to, via scope analysis — not just a name match.
 */
const FRAMEWORK_MOUNTS = [
  // Better Auth catch-all: `export const { GET, POST } = toNextJsHandler(auth)`. The
  // pattern anchors the mount to the app root (apps/<name>/(src/)app/api/...) so a nested
  // app/api/... segment elsewhere in the tree can't claim the exemption.
  {
    pattern: /\/apps\/[^/]+\/(?:src\/)?app\/api\/auth\/\[\.\.\.all\]\/route\.ts$/,
    callee: "toNextJsHandler",
    importSource: "better-auth/next-js",
  },
  // Inngest serve mount: `export const { GET, POST, PUT } = serve({ client, functions })`.
  {
    pattern: /\/apps\/[^/]+\/(?:src\/)?app\/api\/inngest\/route\.ts$/,
    callee: "serve",
    importSource: "inngest/next",
  },
];

function frameworkMountFor(filename) {
  const normalized = normalize(filename);
  return FRAMEWORK_MOUNTS.find((mount) => mount.pattern.test(normalized)) ?? null;
}

/**
 * Detects a leading `"use server"` directive prologue on `program.body[0]`. Directives
 * can't be targeted by `files` globs (they're a runtime/parse-time fact, not a path fact),
 * so the rule itself inspects the AST — exactly the shape plan D.9.3 prescribes. Handles
 * both the `directive` property some parsers attach and a plain leading string-literal
 * statement.
 */
function hasUseServerDirective(program) {
  const first = program.body[0];
  if (!first || first.type !== "ExpressionStatement") return false;
  if (typeof first.directive === "string") return first.directive === "use server";
  const expr = first.expression;
  return Boolean(expr && expr.type === "Literal" && expr.value === "use server");
}

/**
 * B3 bypass fix: the same directive-prologue check as `hasUseServerDirective`, but applied
 * to a function's own `BlockStatement` body instead of the Program — an inline
 * `function foo() { "use server"; ... }` (or the arrow/expression equivalent) declares its
 * OWN server action, invisible to the file-level `actionFile` flag and therefore invisible
 * to every other check in this rule. Never true for an arrow function with an expression
 * body (`() => "use server"` is a return value, not a directive).
 */
function hasBodyUseServerDirective(fn) {
  return Boolean(fn.body && fn.body.type === "BlockStatement" && hasUseServerDirective(fn.body));
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

/** Walks the scope chain outward from `scope` looking for a variable named `name` —
 * the standard eslint-scope/`eslint-utils` `findVariable` pattern, reimplemented locally
 * so this module has no extra runtime dependency. */
function findVariable(scope, name) {
  let current = scope;
  while (current) {
    const variable = current.variables.find((v) => v.name === name);
    if (variable) return variable;
    current = current.upper;
  }
  return null;
}

/**
 * B1 bypass fix. `identifierNode` is a callee identifier already confirmed (by
 * `isCallToIdentifier`) to be named `expectedName` — this resolves it, via scope analysis,
 * to the module specifier of an `import { expectedName } from "<module>"` binding, or
 * `null` if it resolves to anything else: a shadowing local declaration/parameter/
 * reassigned `let`/`var`, an aliased import (`{ other as expectedName }`), or nothing
 * (should not happen for a bound identifier, but treated as unresolved defensively).
 * Deliberately does NOT accept default/namespace imports — only a named `ImportSpecifier`
 * is the canonical form.
 */
function resolvedImportSource(context, identifierNode, expectedName) {
  const sourceCode = context.sourceCode ?? context.getSourceCode();
  const scope = sourceCode.getScope(identifierNode);
  const variable = findVariable(scope, expectedName);
  if (!variable) return null;

  for (const def of variable.defs) {
    if (def.type !== "ImportBinding") continue;
    const specifier = def.node;
    if (specifier.type !== "ImportSpecifier") continue;
    if (staticName(specifier.imported) !== expectedName) continue;
    const declaration = def.parent;
    if (
      declaration &&
      declaration.type === "ImportDeclaration" &&
      typeof declaration.source?.value === "string"
    ) {
      return declaration.source.value;
    }
  }
  return null;
}

/** `isCallToIdentifier(node, name)` AND that identifier resolves (B1) to `module`. */
function isLegalFactoryCall(context, node, name, module) {
  return (
    isCallToIdentifier(node, name) && resolvedImportSource(context, node.callee, name) === module
  );
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
      shadowedCallee:
        '`{{name}}` does not resolve to the `{{name}}` import from "{{source}}" — a shadowing local declaration, parameter, or reassigned variable defeats this check. Import `{{name}}` from "{{source}}" and call it directly (plan D.9.3 bypass fix B1).',
      badDestructure:
        "This destructuring export of an HTTP method is not a registered framework mount. Only the files listed in FRAMEWORK_MOUNTS (eslint.factory-rules.mjs) may destructure their documented factory call — shorthand properties, `const`, exact callee (plan D.9.3(e)/G.10.11).",
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
      inlineServerAction:
        'inline server actions are forbidden — move to a top-level "use server" file and export a defineAction(...) call.',
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
          // Same-name match — still needs the B1 resolved-import check before this is
          // accepted as the documented mount exception.
          if (
            resolvedImportSource(context, declarator.init.callee, frameworkMount.callee) ===
            frameworkMount.importSource
          ) {
            return; // exactly this mount's documented exception (FRAMEWORK_MOUNTS above).
          }
          context.report({
            node: declarator,
            messageId: "shadowedCallee",
            data: { name: frameworkMount.callee, source: frameworkMount.importSource },
          });
          return;
        }
        context.report({ node: declarator, messageId: "badDestructure" });
        return;
      }

      if (id.type !== "Identifier" || !HTTP_METHODS.has(id.name)) return;

      if (kind !== "const") {
        context.report({ node: declarator, messageId: "nonConstMethod", data: { name: id.name } });
        return;
      }

      if (isLegalFactoryCall(context, declarator.init, "defineHandler", CORE_MODULE)) return;

      if (isCallToIdentifier(declarator.init, "defineHandler")) {
        // Right name, wrong (or absent) binding — a shadowing local/param/var, or an
        // import from the wrong module/alias (B1 bypass fix).
        context.report({
          node: declarator,
          messageId: "shadowedCallee",
          data: { name: "defineHandler", source: CORE_MODULE },
        });
        return;
      }

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
      if (isLegalFactoryCall(context, declarator.init, "defineAction", CORE_MODULE)) return;
      if (isCallToIdentifier(declarator.init, "defineAction")) {
        context.report({
          node: declarator,
          messageId: "shadowedCallee",
          data: { name: "defineAction", source: CORE_MODULE },
        });
        return;
      }
      context.report({ node: declarator, messageId: "rawAction", data: { name } });
    }

    return {
      Program(node) {
        actionFile = hasUseServerDirective(node);
      },

      // B3 bypass fix: an inline `"use server"` directive on any function's OWN body is
      // always an error, in every file (route file, action file, or neither) — it declares
      // a server action outside the one legal `defineAction(...)` form regardless of what
      // else is going on in the file. Never fires on the Program-level directive (that's
      // `hasUseServerDirective`/`actionFile` above, handled separately) — only on a
      // function's `BlockStatement` body.
      ":function"(node) {
        if (hasBodyUseServerDirective(node)) {
          context.report({ node: node.body.body[0], messageId: "inlineServerAction" });
        }
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
        if (isLegalFactoryCall(context, node.declaration, "defineAction", CORE_MODULE)) return;
        if (isCallToIdentifier(node.declaration, "defineAction")) {
          context.report({
            node,
            messageId: "shadowedCallee",
            data: { name: "defineAction", source: CORE_MODULE },
          });
          return;
        }
        context.report({ node, messageId: "rawAction", data: { name: "default" } });
      },
    };
  },
};

/** True iff `node` is `process` (bare identifier) or `globalThis.process`/`global.process`
 * (B4(i) bypass fix — the two documented ways to reach the same global without the bare
 * name). Non-computed member access only — `globalThis["process"]` is not covered, matching
 * the existing name-only philosophy of this rule. */
function isProcessReference(node) {
  if (node.type === "Identifier" && node.name === "process") return true;
  return Boolean(
    node.type === "MemberExpression" &&
    !node.computed &&
    node.object.type === "Identifier" &&
    (node.object.name === "globalThis" || node.object.name === "global") &&
    node.property.type === "Identifier" &&
    node.property.name === "process",
  );
}

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
      processAlias:
        'Aliasing the global `process` object (e.g. `const p = process`) is forbidden here — it re-opens direct env access under a new name. Import env/capabilities from "@factory/config" (app code) or "@factory/config/node" (package scripts) instead.',
      processImport:
        'Importing from "{{source}}" directly is forbidden here. Import env/capabilities from "@factory/config" (app code) or "@factory/config/node" (package scripts) instead.',
    },
  },
  create(context) {
    return {
      MemberExpression(node) {
        // Covers `process.env`, `globalThis.process.env`, and `global.process.env` (B4(i))
        // — `isProcessReference` recognizes all three forms of "the process object" as
        // `node.object`.
        if (!isProcessReference(node.object)) return;
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

      // B4(ii) bypass fix: `const p = process; p.env.FOO` (and `const p = globalThis.process`
      // / `const { env } = globalThis.process`) re-open direct env access under a new name
      // that the MemberExpression check above never sees. Uses the same `isProcessReference`
      // recognized forms as the MemberExpression check, so aliasing via `globalThis.process`/
      // `global.process` is caught too, not just the bare identifier. The shadow-exemption
      // below only makes sense for the bare-`process` form — a genuinely LOCAL variable named
      // `process` (a parameter, a local declaration that happens to shadow the global) means
      // `const p = process` isn't aliasing the global at all; there's no equivalent local
      // shadow for `globalThis`/`global` themselves, so that form is always reported.
      VariableDeclarator(node) {
        if (!node.init || !isProcessReference(node.init)) return;
        if (node.init.type === "Identifier") {
          const sourceCode = context.sourceCode ?? context.getSourceCode();
          const scope = sourceCode.getScope(node.init);
          const shadow = findVariable(scope, "process");
          // A configured ESLint global (e.g. via `languageOptions.globals`) also resolves
          // via `findVariable` but carries no `defs` — only an actual local declaration
          // (parameter, `let`/`const`, etc.) has `defs.length > 0` and should exempt this.
          if (shadow && shadow.defs.length > 0) return;
        }
        context.report({ node, messageId: "processAlias" });
      },

      // B4(iii) bypass fix: `import process from "process"` / `import { env } from
      // "node:process"` reach the same global through the Node built-in module instead of
      // the implicit global — same ban, same exceptions (PROCESS_ENV_EXCEPTIONS in
      // eslint.config.mjs already scopes this rule off entirely for the files allowed to
      // touch env directly).
      ImportDeclaration(node) {
        const source = node.source.value;
        if (source === "process" || source === "node:process") {
          context.report({ node, messageId: "processImport", data: { source } });
        }
      },
    };
  },
};

export const factoryPlugin = {
  rules: {
    "no-raw-handler": noRawHandlerRule,
    "no-process-env": noProcessEnvRule,
  },
};
