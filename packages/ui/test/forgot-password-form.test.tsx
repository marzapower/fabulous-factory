// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@factory/auth/client", () => ({
  authClient: { requestPasswordReset: vi.fn() },
}));

import { authClient } from "@factory/auth/client";
import { ForgotPasswordForm, resolveForgotPasswordView } from "../src/auth/forgot-password-form";

const mockedRequestPasswordReset = vi.mocked(authClient.requestPasswordReset);

beforeEach(() => {
  mockedRequestPasswordReset.mockReset();
});

describe("resolveForgotPasswordView", () => {
  it("renders the honest disabled state when email isn't configured", () => {
    expect(resolveForgotPasswordView(false)).toBe("disabled");
  });

  it("renders the request form when email is configured", () => {
    expect(resolveForgotPasswordView(true)).toBe("form");
  });
});

describe("ForgotPasswordForm", () => {
  it("renders the honest disabled state instead of a form when email isn't configured — a broken form would be worse than none", () => {
    render(<ForgotPasswordForm emailEnabled={false} />);

    expect(screen.getByText(/password reset isn.t available/i)).toBeTruthy();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("submits the typed email with the fixed redirectTo, and shows the non-enumerating success copy", async () => {
    mockedRequestPasswordReset.mockResolvedValue({ data: { status: true }, error: null });
    render(<ForgotPasswordForm emailEnabled={true} />);

    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: "person@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: /send reset link/i }));

    await waitFor(() => {
      expect(mockedRequestPasswordReset).toHaveBeenCalledWith({
        email: "person@example.com",
        redirectTo: "/reset-password",
      });
    });

    // Deliberately doesn't confirm account existence — mirrors better-auth's own
    // non-enumerating response, see the component's doc comment.
    expect((await screen.findByRole("status")).textContent).toMatch(/person@example\.com/);
  });

  it("renders the friendly error message with role=alert and stays on the form when the request fails", async () => {
    mockedRequestPasswordReset.mockResolvedValue({
      data: null,
      error: { code: "USER_NOT_FOUND", message: "raw" },
    });
    render(<ForgotPasswordForm emailEnabled={true} />);

    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: "nobody@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: /send reset link/i }));

    expect((await screen.findByRole("alert")).textContent).toBe(
      "This link is invalid or has expired. Request a new one.",
    );
    // Failed request leaves the form up for another attempt, not the success state.
    expect(screen.getByRole("button", { name: /send reset link/i })).toBeTruthy();
  });
});
