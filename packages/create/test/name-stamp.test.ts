import { describe, expect, it } from "vitest";

import {
  NAME_PLACEHOLDER,
  stampProjectName,
  toKebabCase,
  validateProjectName,
} from "../src/lib/name-stamp";

describe("stampProjectName", () => {
  it("replaces every occurrence of the placeholder", () => {
    const content = `{"name": "${NAME_PLACEHOLDER}"}\n# ${NAME_PLACEHOLDER}\n`;
    expect(stampProjectName(content, "my-saas")).toBe('{"name": "my-saas"}\n# my-saas\n');
  });

  it("is a no-op when the placeholder isn't present", () => {
    expect(stampProjectName("nothing to see here", "my-saas")).toBe("nothing to see here");
  });
});

describe("toKebabCase", () => {
  it("lowercases and hyphenates spaces", () => {
    expect(toKebabCase("My Cool App")).toBe("my-cool-app");
  });

  it("collapses runs of non-alphanumeric characters into a single hyphen", () => {
    expect(toKebabCase("my___cool!!app")).toBe("my-cool-app");
  });

  it("trims leading/trailing hyphens", () => {
    expect(toKebabCase("  -My App-  ")).toBe("my-app");
  });

  it("passes an already-kebab name through unchanged", () => {
    expect(toKebabCase("my-app")).toBe("my-app");
  });
});

describe("validateProjectName", () => {
  it("accepts a valid kebab-case name", () => {
    expect(validateProjectName("my-app-2")).toBeUndefined();
  });

  it("rejects an empty name", () => {
    expect(validateProjectName("")).toMatch(/required/);
  });

  it("rejects a name with uppercase or non-kebab characters", () => {
    expect(validateProjectName("My App")).toMatch(/kebab-case/);
  });
});
