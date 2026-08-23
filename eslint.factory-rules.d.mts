// Ambient declaration for `eslint.factory-rules.mjs`'s one export — plain JS (with JSDoc)
// by design (it's ESLint flat-config plugin code, loaded directly by `eslint.config.mjs`
// with no build step), but `packages/config/test/factory-eslint-rules.test.ts` imports it
// from a `.ts` file and needs a real type, not an implicit `any`, to drive
// `RuleTester.run(name, rule, tests)`.
import type { Rule } from "eslint";

export declare const factoryPlugin: {
  rules: {
    "no-raw-handler": Rule.RuleModule;
    "no-process-env": Rule.RuleModule;
  };
};
