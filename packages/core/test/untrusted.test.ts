import { describe, expect, it } from "vitest";

import { isUntrusted, untrusted } from "../src/untrusted";

describe("untrusted / isUntrusted", () => {
  it("wraps a value and exposes it via .value", () => {
    const wrapped = untrusted("<script>alert(1)</script>");
    expect(wrapped.value).toBe("<script>alert(1)</script>");
  });

  it("isUntrusted recognizes a wrapped value", () => {
    expect(isUntrusted(untrusted("hello"))).toBe(true);
  });

  it("isUntrusted rejects a plain, unwrapped value", () => {
    expect(isUntrusted("hello")).toBe(false);
    expect(isUntrusted({ value: "hello" })).toBe(false); // structurally similar, but unbranded
  });

  it("isUntrusted rejects null/undefined/primitives without throwing", () => {
    expect(isUntrusted(null)).toBe(false);
    expect(isUntrusted(undefined)).toBe(false);
    expect(isUntrusted(42)).toBe(false);
    expect(isUntrusted(true)).toBe(false);
  });

  it("wraps objects and arrays, preserving identity of the underlying value", () => {
    const original = { scraped: "page content" };
    const wrapped = untrusted(original);
    expect(wrapped.value).toBe(original);
    expect(isUntrusted(wrapped)).toBe(true);
  });
});
