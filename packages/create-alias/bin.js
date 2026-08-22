#!/usr/bin/env node
// Thin proxy so `npm create fabulous-factory` / `pnpm create fabulous-factory` work.
const { main } = await import("fabulous-factory/dist/cli.js");
await main();
