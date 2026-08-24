// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@factory/auth/client", () => ({
  authClient: { updateUser: vi.fn(), deleteUser: vi.fn() },
}));

const mockPush = vi.fn();
const mockRefresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, refresh: mockRefresh }),
}));

import { authClient } from "@factory/auth/client";
import { AccountSettings } from "../src/account/account-settings";

const mockedUpdateUser = vi.mocked(authClient.updateUser);
const mockedDeleteUser = vi.mocked(authClient.deleteUser);

const USER = { name: "Ada Lovelace", email: "ada@example.com", emailVerified: true };

beforeEach(() => {
  mockedUpdateUser.mockReset();
  mockedDeleteUser.mockReset();
  mockPush.mockReset();
  mockRefresh.mockReset();
});

describe("AccountSettings — profile card", () => {
  it("saves the typed name via authClient.updateUser, shows the saved state, and refreshes the router-cached session data", async () => {
    mockedUpdateUser.mockResolvedValue({ data: {}, error: null });
    render(
      <AccountSettings
        user={USER}
        emailEnabled={true}
        hasPasswordAccount={true}
        exportHref="/api/account/export"
      />,
    );

    fireEvent.change(screen.getByLabelText(/^name$/i), {
      target: { value: "Ada King" },
    });
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => {
      expect(mockedUpdateUser).toHaveBeenCalledWith({ name: "Ada King" });
    });
    expect((await screen.findByRole("status")).textContent).toMatch(/profile updated/i);
    expect(mockRefresh).toHaveBeenCalled();
  });

  it("disables the save button until the name actually changes, so a no-op save can't be submitted", () => {
    render(
      <AccountSettings
        user={USER}
        emailEnabled={true}
        hasPasswordAccount={true}
        exportHref="/api/account/export"
      />,
    );

    expect(
      (screen.getByRole("button", { name: /save changes/i }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });
});

describe("AccountSettings — danger zone: email confirmation × password collection", () => {
  it("credential account, email enabled: collects the password, and success shows the check-your-email state without navigating away", async () => {
    mockedDeleteUser.mockResolvedValue({ data: {}, error: null });
    render(
      <AccountSettings
        user={USER}
        emailEnabled={true}
        hasPasswordAccount={true}
        exportHref="/api/account/export"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /^delete account$/i }));
    expect(screen.getByLabelText(/confirm your password/i)).toBeTruthy();

    fireEvent.change(screen.getByLabelText(/confirm your password/i), {
      target: { value: "hunter2" },
    });
    fireEvent.click(screen.getByRole("button", { name: /email me a confirmation link/i }));

    await waitFor(() => {
      expect(mockedDeleteUser).toHaveBeenCalledWith({ password: "hunter2", callbackURL: "/" });
    });
    expect((await screen.findByRole("status")).textContent).toMatch(/check your email/i);
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("social-only account, email enabled: no password field, still confirms by email", async () => {
    mockedDeleteUser.mockResolvedValue({ data: {}, error: null });
    render(
      <AccountSettings
        user={USER}
        emailEnabled={true}
        hasPasswordAccount={false}
        exportHref="/api/account/export"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /^delete account$/i }));
    expect(screen.queryByLabelText(/confirm your password/i)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /email me a confirmation link/i }));

    await waitFor(() => {
      expect(mockedDeleteUser).toHaveBeenCalledWith({ callbackURL: "/" });
    });
    expect((await screen.findByRole("status")).textContent).toMatch(/check your email/i);
  });

  it("credential account, email disabled: collects the password and deletes immediately, navigating home", async () => {
    mockedDeleteUser.mockResolvedValue({ data: {}, error: null });
    render(
      <AccountSettings
        user={USER}
        emailEnabled={false}
        hasPasswordAccount={true}
        exportHref="/api/account/export"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /^delete account$/i }));
    expect(screen.getByLabelText(/confirm your password/i)).toBeTruthy();

    fireEvent.change(screen.getByLabelText(/confirm your password/i), {
      target: { value: "hunter2" },
    });
    fireEvent.click(screen.getByRole("button", { name: /confirm delete/i }));

    await waitFor(() => {
      expect(mockedDeleteUser).toHaveBeenCalledWith({ password: "hunter2" });
    });
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/");
    });
    expect(mockRefresh).toHaveBeenCalled();
  });

  it("social-only account, email disabled: no password field, deletes immediately with no arguments", async () => {
    mockedDeleteUser.mockResolvedValue({ data: {}, error: null });
    render(
      <AccountSettings
        user={USER}
        emailEnabled={false}
        hasPasswordAccount={false}
        exportHref="/api/account/export"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /^delete account$/i }));
    expect(screen.queryByLabelText(/confirm your password/i)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /confirm delete/i }));

    await waitFor(() => {
      expect(mockedDeleteUser).toHaveBeenCalledWith({});
    });
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/");
    });
  });

  it("renders the friendly error with role=alert and returns to the confirming step (not idle) when deletion fails", async () => {
    mockedDeleteUser.mockResolvedValue({
      data: null,
      error: { code: "INVALID_PASSWORD", message: "raw" },
    });
    render(
      <AccountSettings
        user={USER}
        emailEnabled={false}
        hasPasswordAccount={true}
        exportHref="/api/account/export"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /^delete account$/i }));
    fireEvent.change(screen.getByLabelText(/confirm your password/i), {
      target: { value: "wrong" },
    });
    fireEvent.click(screen.getByRole("button", { name: /confirm delete/i }));

    expect((await screen.findByRole("alert")).textContent).toBe("That password is incorrect.");
    // Still on the confirming step — the password field and cancel button are still there.
    expect(screen.getByLabelText(/confirm your password/i)).toBeTruthy();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("cancel returns to the idle state and clears any typed password", () => {
    render(
      <AccountSettings
        user={USER}
        emailEnabled={false}
        hasPasswordAccount={true}
        exportHref="/api/account/export"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /^delete account$/i }));
    fireEvent.change(screen.getByLabelText(/confirm your password/i), {
      target: { value: "hunter2" },
    });
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));

    expect(screen.getByRole("button", { name: /^delete account$/i })).toBeTruthy();
    expect(screen.queryByLabelText(/confirm your password/i)).toBeNull();
  });
});
