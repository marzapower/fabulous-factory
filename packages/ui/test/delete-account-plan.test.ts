import { describe, expect, it } from "vitest";

import { resolveDeleteAccountPlan } from "../src/account/delete-account-plan";

describe("resolveDeleteAccountPlan", () => {
  it("collects the password exactly when a credential account exists", () => {
    expect(
      resolveDeleteAccountPlan({ hasPasswordAccount: true, emailEnabled: true }).collectPassword,
    ).toBe(true);
    expect(
      resolveDeleteAccountPlan({ hasPasswordAccount: true, emailEnabled: false }).collectPassword,
    ).toBe(true);
    expect(
      resolveDeleteAccountPlan({ hasPasswordAccount: false, emailEnabled: true }).collectPassword,
    ).toBe(false);
    expect(
      resolveDeleteAccountPlan({ hasPasswordAccount: false, emailEnabled: false }).collectPassword,
    ).toBe(false);
  });

  it("confirms via email whenever email is live — even for credential accounts, since better-auth's delete endpoint always ends in the verification email when the callback is configured (never an immediate delete)", () => {
    expect(
      resolveDeleteAccountPlan({ hasPasswordAccount: true, emailEnabled: true }).confirmation,
    ).toBe("email");
    expect(
      resolveDeleteAccountPlan({ hasPasswordAccount: false, emailEnabled: true }).confirmation,
    ).toBe("email");
  });

  it("confirms immediately only when email is disabled (password-verified or fresh-session path)", () => {
    expect(
      resolveDeleteAccountPlan({ hasPasswordAccount: true, emailEnabled: false }).confirmation,
    ).toBe("immediate");
    expect(
      resolveDeleteAccountPlan({ hasPasswordAccount: false, emailEnabled: false }).confirmation,
    ).toBe("immediate");
  });
});
