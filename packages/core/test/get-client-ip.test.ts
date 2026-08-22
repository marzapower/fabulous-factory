import { describe, expect, it } from "vitest";

import { getClientIp } from "../src/get-client-ip";

describe("getClientIp", () => {
  it("returns the first entry of x-forwarded-for", () => {
    const headers = new Headers({ "x-forwarded-for": "203.0.113.5, 10.0.0.1, 10.0.0.2" });
    expect(getClientIp(headers)).toBe("203.0.113.5");
  });

  it("trims whitespace around the first entry", () => {
    const headers = new Headers({ "x-forwarded-for": "  203.0.113.5  , 10.0.0.1" });
    expect(getClientIp(headers)).toBe("203.0.113.5");
  });

  it("falls back to 'unknown' when the header is absent", () => {
    expect(getClientIp(new Headers())).toBe("unknown");
  });

  it("falls back to 'unknown' when the header is present but empty", () => {
    const headers = new Headers({ "x-forwarded-for": "" });
    expect(getClientIp(headers)).toBe("unknown");
  });

  it("falls back to 'unknown' when the first entry is blank (leading comma)", () => {
    const headers = new Headers({ "x-forwarded-for": " , 10.0.0.1" });
    expect(getClientIp(headers)).toBe("unknown");
  });

  it("collapses a spoofed non-IP value into the shared 'unknown' bucket (K.16 N3)", () => {
    const headers = new Headers({ "x-forwarded-for": "not-an-ip, 10.0.0.1" });
    expect(getClientIp(headers)).toBe("unknown");
  });

  it("collapses an oversized header value into the shared 'unknown' bucket (K.16 N3)", () => {
    const headers = new Headers({ "x-forwarded-for": `${"1".repeat(200)}, 10.0.0.1` });
    expect(getClientIp(headers)).toBe("unknown");
  });

  it("accepts a valid IPv6 address", () => {
    const headers = new Headers({ "x-forwarded-for": "::1" });
    expect(getClientIp(headers)).toBe("::1");
  });
});
