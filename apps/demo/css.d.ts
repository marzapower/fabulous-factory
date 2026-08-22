// Ambient module declaration for plain (non-CSS-Modules) side-effect CSS imports, e.g.
// `import "./globals.css"` in app/layout.tsx. Next's own `next-env.d.ts` (generated,
// do-not-edit) only declares `*.module.css`/`*.module.scss` — not bare `.css` — so a
// direct `tsc --noEmit` run (as opposed to `next build`'s own type-check pass) fails
// with TS2882 "Cannot find module or type declarations for side-effect import" without
// this. Next's webpack/turbopack pipeline handles the actual CSS loading at build time;
// this file exists purely to satisfy the standalone type checker.
declare module "*.css";
