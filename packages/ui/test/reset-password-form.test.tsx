// @vitest-environment jsdom
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@factory/auth/client", () => ({
  authClient: { resetPassword: vi.fn() },
}));

const mockUseSearchParams = vi.fn();
vi.mock("next/navigation", () => ({
  useSearchParams: () => mockUseSearchParams(),
}));

import { authClient } from "@factory/auth/client";
import { ResetPasswordForm, resolveResetPasswordView } from "../src/auth/reset-password-form";
import { renderI18n } from "./render";

const mockedResetPassword = vi.mocked(authClient.resetPassword);

function withToken(token: string | null) {
  mockUseSearchParams.mockReturnValue({ get: (key: string) => (key === "token" ? token : null) });
}

beforeEach(() => {
  mockedResetPassword.mockReset();
  mockUseSearchParams.mockReset();
});

describe("resolveResetPasswordView", () => {
  it("renders the invalid/expired state when there is no token", () => {
    expect(resolveResetPasswordView(null)).toBe("invalid");
  });

  it("renders the reset form when a token is present", () => {
    expect(resolveResetPasswordView("a-valid-token")).toBe("form");
  });
});

describe("ResetPasswordForm", () => {
  it("renders the invalid/expired state with a link back to /forgot-password when the URL has no token — covers both 'never had one' and the ?error=INVALID_TOKEN redirect", () => {
    withToken(null);
    renderI18n(<ResetPasswordForm />);

    expect(screen.getByRole("alert").textContent).toMatch(/invalid or has expired/i);
    const link = screen.getByRole("link", { name: /request a new one/i });
    expect(link.getAttribute("href")).toBe("/forgot-password");
    expect(screen.queryByLabelText(/new password/i)).toBeNull();
  });

  it("submits the token from the URL together with the typed new password — never a client-typed token", async () => {
    withToken("token-from-url");
    mockedResetPassword.mockResolvedValue({ data: { status: true }, error: null });
    renderI18n(<ResetPasswordForm />);

    fireEvent.change(screen.getByLabelText(/^new password$/i), {
      target: { value: "correct horse battery staple" },
    });
    fireEvent.change(screen.getByLabelText(/confirm new password/i), {
      target: { value: "correct horse battery staple" },
    });
    fireEvent.click(screen.getByRole("button", { name: /reset password/i }));

    await waitFor(() => {
      expect(mockedResetPassword).toHaveBeenCalledWith({
        newPassword: "correct horse battery staple",
        token: "token-from-url",
      });
    });

    expect((await screen.findByRole("status")).textContent).toMatch(/password has been reset/i);
    expect(screen.getByRole("link", { name: /sign in/i }).getAttribute("href")).toBe("/login");
  });

  it("blocks submission client-side and never calls resetPassword when the confirmation doesn't match", () => {
    withToken("token-from-url");
    renderI18n(<ResetPasswordForm />);

    fireEvent.change(screen.getByLabelText(/^new password$/i), {
      target: { value: "correct horse battery staple" },
    });
    fireEvent.change(screen.getByLabelText(/confirm new password/i), {
      target: { value: "does not match" },
    });
    fireEvent.click(screen.getByRole("button", { name: /reset password/i }));

    expect(screen.getByRole("alert").textContent).toBe("Passwords don't match.");
    expect(mockedResetPassword).not.toHaveBeenCalled();
  });

  it("renders the friendly error message with role=alert when the server rejects the reset", async () => {
    withToken("token-from-url");
    mockedResetPassword.mockResolvedValue({
      data: null,
      error: { code: "INVALID_TOKEN", message: "raw" },
    });
    renderI18n(<ResetPasswordForm />);

    fireEvent.change(screen.getByLabelText(/^new password$/i), {
      target: { value: "correct horse battery staple" },
    });
    fireEvent.change(screen.getByLabelText(/confirm new password/i), {
      target: { value: "correct horse battery staple" },
    });
    fireEvent.click(screen.getByRole("button", { name: /reset password/i }));

    expect((await screen.findByRole("alert")).textContent).toBe(
      "This link is invalid or has expired. Request a new one.",
    );
  });
});
