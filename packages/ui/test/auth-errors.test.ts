import { describe, expect, it } from "vitest";

import { describeAuthError } from "../src/auth/errors";

describe("describeAuthError", () => {
  it.each([
    ["INVALID_TOKEN", "This link is invalid or has expired. Request a new one."],
    ["PASSWORD_TOO_SHORT", "That password is too short."],
    ["PASSWORD_TOO_LONG", "That password is too long."],
    ["USER_NOT_FOUND", "This link is invalid or has expired. Request a new one."],
    ["SESSION_EXPIRED", "Your session has expired. Sign in again to continue."],
    ["INVALID_PASSWORD", "That password is incorrect."],
    ["CREDENTIAL_ACCOUNT_NOT_FOUND", "This account doesn't have a password set."],
    ["RESET_PASSWORD_DISABLED", "Password reset isn't available for this account."],
  ])("maps the %s code to its friendly copy", (code, expected) => {
    expect(describeAuthError({ code, message: "raw server message" }, "fallback")).toBe(expected);
  });

  it("falls back to the raw message when the code is unrecognized", () => {
    expect(describeAuthError({ code: "SOMETHING_ELSE", message: "raw message" }, "fallback")).toBe(
      "raw message",
    );
  });

  it("falls back to the raw message when there is no code at all", () => {
    expect(describeAuthError({ message: "raw message" }, "fallback")).toBe("raw message");
  });

  it("falls back to the given fallback when neither a known code nor a message is present", () => {
    expect(describeAuthError({}, "fallback")).toBe("fallback");
  });
});
