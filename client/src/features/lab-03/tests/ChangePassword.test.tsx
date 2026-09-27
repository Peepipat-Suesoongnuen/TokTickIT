import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import ChangePassword from "../../../pages/ChangePassword.js";
import { AuthContext } from "../../../contexts/AuthContext.js";
import * as api from "../../../api.js";

vi.mock("../../../api.js");

const mustChangeUser = {
  id: 1,
  name: "Alice Example",
  email: "alice@example.com",
  role: "REQUESTER",
  active: true,
  mustChangePassword: true,
};

function renderChangePassword(onChanged = vi.fn()) {
  return render(
    <MemoryRouter>
      <AuthContext.Provider
        value={{
          user: mustChangeUser,
          loading: false,
          login: vi.fn(),
          logout: vi.fn(),
          refresh: vi.fn().mockResolvedValue(undefined),
        }}
      >
        <ChangePassword onChanged={onChanged} />
      </AuthContext.Provider>
    </MemoryRouter>,
  );
}

async function fillValid(user: ReturnType<typeof userEvent.setup>, current = "Old!Pass1") {
  await user.type(screen.getByLabelText("Current Password"), current);
  await user.type(screen.getByLabelText("New Password"), "New!Pass22");
  await user.type(screen.getByLabelText("Confirm New Password"), "New!Pass22");
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe("ChangePassword (Lab 3 Issue #45)", () => {
  it("renders three password fields each with an SVG show/hide control", async () => {
    const user = userEvent.setup();
    renderChangePassword();

    for (const label of ["Current Password", "New Password", "Confirm New Password"] as const) {
      expect(screen.getByLabelText(label)).toHaveAttribute("type", "password");
    }
    const toggles = [
      "Show current password",
      "Show new password",
      "Show confirm password",
    ] as const;
    for (const name of toggles) {
      const button = screen.getByRole("button", { name });
      expect(button).toHaveAttribute("aria-pressed", "false");
      // Inline SVG eye icon, never emoji.
      expect(button.querySelector("svg")).not.toBeNull();
      expect(button).not.toHaveTextContent("👁");
    }

    await user.click(screen.getByRole("button", { name: "Show new password" }));
    expect(screen.getByLabelText("New Password")).toHaveAttribute("type", "text");
    const hide = screen.getByRole("button", { name: "Hide new password" });
    expect(hide).toHaveAttribute("aria-pressed", "true");
    // Focus returns to the revealed input after toggling.
    expect(screen.getByLabelText("New Password")).toHaveFocus();
  });

  it("renders the mockup brand heading, note, and exactly one h1", () => {
    renderChangePassword();

    expect(
      screen.getByRole("heading", { level: 1, name: "TokTickIT IT Service Desk" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("You must change your initial password before entering the application."),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Change Password" })).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  it("uses the exact mockup checklist copy and greens met items", async () => {
    const user = userEvent.setup();
    renderChangePassword();

    for (const copy of [
      "8–64 characters",
      "At least one uppercase letter",
      "At least one lowercase letter",
      "At least one special character",
      "Must differ from the current password",
    ]) {
      expect(screen.getByText(copy)).toBeInTheDocument();
    }

    await user.type(screen.getByLabelText("Current Password"), "Old!Pass1");
    await user.type(screen.getByLabelText("New Password"), "New!Pass22");

    for (const li of screen.getAllByRole("listitem")) {
      expect(li).toHaveClass("text-success");
    }
  });

  it("marks confirm aria-invalid on non-empty mismatch only", async () => {
    const user = userEvent.setup();
    renderChangePassword();

    const confirm = screen.getByLabelText("Confirm New Password");
    expect(confirm).toHaveAttribute("aria-invalid", "false");

    await user.type(screen.getByLabelText("New Password"), "New!Pass22");
    await user.type(confirm, "Different!9");
    expect(confirm).toHaveAttribute("aria-invalid", "true");
  });

  it("checklist below Confirm starts as bullets and checks off as rules pass", async () => {
    const user = userEvent.setup();
    renderChangePassword();

    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(5);
    for (const li of items) expect(li).toHaveTextContent("•");

    await user.type(screen.getByLabelText("Current Password"), "Old!Pass1");
    await user.type(screen.getByLabelText("New Password"), "New!Pass22");

    for (const li of screen.getAllByRole("listitem")) {
      expect(li).toHaveTextContent("✓");
    }
  });

  it("confirm mismatch blocks submit and never calls the API", async () => {
    const user = userEvent.setup();
    renderChangePassword();

    await user.type(screen.getByLabelText("Current Password"), "Old!Pass1");
    await user.type(screen.getByLabelText("New Password"), "New!Pass22");
    await user.type(screen.getByLabelText("Confirm New Password"), "Different!9");
    await user.click(screen.getByRole("button", { name: "Change Password" }));

    expect(await screen.findByText("Passwords do not match.")).toBeInTheDocument();
    expect(api.changePassword).not.toHaveBeenCalled();
  });

  it("renders server field errors for policy failures", async () => {
    const user = userEvent.setup();
    vi.mocked(api.changePassword).mockRejectedValue({
      status: 400,
      body: {
        error: { code: "VALIDATION_FAILED", message: "One or more fields are invalid." },
        fieldErrors: {
          newPassword: "New password does not meet the password policy: SAME_AS_CURRENT.",
        },
      },
    });
    renderChangePassword();

    await user.type(screen.getByLabelText("Current Password"), "Old!Pass1");
    await user.type(screen.getByLabelText("New Password"), "Old!Pass1");
    await user.type(screen.getByLabelText("Confirm New Password"), "Old!Pass1");
    await user.click(screen.getByRole("button", { name: "Change Password" }));

    expect(
      await screen.findByText(/does not meet the password policy/),
    ).toBeInTheDocument();
  });

  it("renders the server current-password error", async () => {
    const user = userEvent.setup();
    vi.mocked(api.changePassword).mockRejectedValue({
      status: 400,
      body: {
        error: { code: "CURRENT_PASSWORD_INVALID", message: "Current password is incorrect." },
      },
    });
    renderChangePassword();

    await fillValid(user);
    await user.click(screen.getByRole("button", { name: "Change Password" }));

    expect(await screen.findByText("Current password is incorrect.")).toBeInTheDocument();
  });

  it("success calls the continuation", async () => {
    const user = userEvent.setup();
    const onChanged = vi.fn();
    const updated = { ...mustChangeUser, mustChangePassword: false };
    vi.mocked(api.changePassword).mockResolvedValue({ user: updated });
    renderChangePassword(onChanged);

    await fillValid(user);
    await user.click(screen.getByRole("button", { name: "Change Password" }));

    await waitFor(() => expect(onChanged).toHaveBeenCalledWith(updated));
    expect(api.changePassword).toHaveBeenCalledWith("Old!Pass1", "New!Pass22");
  });
});
