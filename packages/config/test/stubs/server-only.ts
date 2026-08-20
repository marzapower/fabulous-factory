// Stub replacing the real `server-only` package under vitest.
//
// The real `server-only` package throws under Node's default export condition (it only
// resolves cleanly under the `react-server` condition that Next.js's webpack build sets
// up). vitest runs under plain Node, so importing `src/index.ts` (whose first line is
// `import 'server-only'`) would otherwise detonate every test that touches it, even
// transitively. `vitest.config.ts` aliases `server-only` to this empty, side-effect-free
// module so that import resolves to a no-op instead.
export {};
