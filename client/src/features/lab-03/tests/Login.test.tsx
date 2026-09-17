import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import App from "../../../App.js";
import Login from "../../../pages/Login.js";
import AppShell from "../../../components/AppShell.js";
import { AuthProvider, AuthContext } from "../../../contexts/AuthContext.js";
import { RequesterProvider } from "../../../contexts/RequesterContext.js";
import * as api from "../../../api.js";

vi.mock("../../../api.js");

const activeUser = {
  id: 1,
  name: "Alice Example",
  email: "alice@example.com",
  role: "REQUESTER",
  active: true,
  mustChangePassword: false,
};
const mustChangeUser = { ...activeUser, mustChangePassword: true };

function renderLogin(loginMock = vi.fn()) {
  return render(
    <MemoryRouter>
      <AuthContext.Provider
        value={{ user: null, loading: false, login: loginMock, logout: vi.fn(), refresh: vi.fn() }}
      >
        <Login />
      </AuthContext.Provider>
    </MemoryRouter>,
  );
}

function renderApp(path = "/my-tickets") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <RequesterProvider>
        <App />
      </RequesterProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe("Login (Lab 3 Issue #45)", () => {
  it("renders the mockup heading/note with a plain password field and no eye toggle", async () => {
    renderLogin();

    expect(screen.getByRole("heading", { level: 1, name: "TokTickIT IT Service Desk" })).toBeInTheDocument();
    expect(
      screen.getByText("Sign in with your TokTickIT account to continue."),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toHaveAttribute("type", "password");
    expect(screen.queryByRole("button", { name: /show password|hide password/i })).toBeNull();
  });

  it("empty submit shows validation and never calls the API", async () => {
    const user = userEvent.setup();
    const loginMock = vi.fn();
    renderLogin(loginMock);

    await user.click(screen.getByRole("button", { name: "Sign In" }));

    expect(await screen.findByText("Email is required.")).toBeInTheDocument();
    expect(screen.getByText("Password is required.")).toBeInTheDocument();
    expect(loginMock).not.toHaveBeenCalled();
  });

  it("401 shows a safe generic message with no account-state detail", async () => {
    const user = userEvent.setup();
    const loginMock = vi.fn().mockRejectedValue({
      status: 401,
      body: { error: { code: "INVALID_CREDENTIALS", message: "Invalid email or password." } },
    });
    renderLogin(loginMock);

    await user.type(screen.getByLabelText("Email"), "alice@example.com");
    await user.type(screen.getByLabelText("Password"), "wrong-password");
    await user.click(screen.getByRole("button", { name: "Sign In" }));

    expect(await screen.findByText("Invalid email or password.")).toBeInTheDocument();
    expect(
      screen.queryByText(/inactive|locked|disabled|not found|does not exist/i),
    ).not.toBeInTheDocument();
  });

  it("inactive-account login shows the same generic message", async () => {
    const user = userEvent.setup();
    // Server answers inactive-account logins with the generic 401 shape
    // (auth.ts: unknown / wrong / inactive / locked are indistinguishable).
    const loginMock = vi.fn().mockRejectedValue({
      status: 401,
      body: { error: { code: "INVALID_CREDENTIALS", message: "Invalid email or password." } },
    });
    renderLogin(loginMock);

    await user.type(screen.getByLabelText("Email"), "inactive@example.com");
    await user.type(screen.getByLabelText("Password"), "some-password");
    await user.click(screen.getByRole("button", { name: "Sign In" }));

    expect(await screen.findByText("Invalid email or password.")).toBeInTheDocument();
    expect(
      screen.queryByText(/inactive|locked|disabled|not found|does not exist/i),
    ).not.toBeInTheDocument();
  });

  it("busy state disables duplicate submission while signing in", async () => {
    const user = userEvent.setup();
    const loginMock = vi.fn().mockImplementation(() => new Promise(() => {}));
    renderLogin(loginMock);

    await user.type(screen.getByLabelText("Email"), "alice@example.com");
    await user.type(screen.getByLabelText("Password"), "secret-password");
    await user.click(screen.getByRole("button", { name: "Sign In" }));

    expect(await screen.findByRole("button", { name: "Signing in…" })).toBeDisabled();
    expect(loginMock).toHaveBeenCalledWith("alice@example.com", "secret-password");
  });

  it("mustChangePassword user lands on the change-password gate, not the app", async () => {
    vi.mocked(api.getCurrentUser).mockResolvedValue({ user: mustChangeUser });
    renderApp();

    expect(await screen.findByRole("heading", { name: "Change Password" })).toBeInTheDocument();
    expect(screen.queryByLabelText(/Development Requester/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "My Tickets" })).not.toBeInTheDocument();
  });

  it("authenticated user without the flag reaches the intact requester gate", async () => {
    vi.mocked(api.getCurrentUser).mockResolvedValue({ user: activeUser });
    vi.mocked(api.fetchRequesters).mockResolvedValue([
      { id: 7, name: "Rita Requester", email: "rita@test.local" },
    ]);
    renderApp();

    expect(await screen.findByLabelText(/Development Requester/i)).toBeInTheDocument();
  });
});

describe("Shell identity (Lab 3 Issue #45)", () => {
  it("shows name + role with a menu holding Change Password and Logout", async () => {
    const user = userEvent.setup();
    const logoutMock = vi.fn().mockResolvedValue(undefined);
    render(
      <MemoryRouter>
        <RequesterProvider>
          <AuthContext.Provider
            value={{
              user: activeUser,
              loading: false,
              login: vi.fn(),
              logout: logoutMock,
              refresh: vi.fn(),
            }}
          >
            <AppShell>
              <p>child content</p>
            </AppShell>
          </AuthContext.Provider>
        </RequesterProvider>
      </MemoryRouter>,
    );

    expect(screen.getByText(/Alice Example/)).toBeInTheDocument();
    expect(screen.getByText(/REQUESTER/)).toBeInTheDocument();

    // Mockup chip: one button holds person icon + name + role badge + chevron.
    const chip = screen.getByRole("button", { name: /user menu/i });
    expect(chip).toHaveTextContent(/Alice Example/);
    expect(chip).toHaveTextContent(/REQUESTER/);
    expect(chip.querySelector(".badge.rounded-pill.border")).not.toBeNull();

    await user.click(chip);
    expect(screen.getByRole("menuitem", { name: "Change Password" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Logout" })).toHaveClass("text-danger");

    await user.click(screen.getByRole("menuitem", { name: "Logout" }));
    expect(logoutMock).toHaveBeenCalled();
  });
});
