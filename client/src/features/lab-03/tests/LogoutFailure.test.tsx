import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { AuthContext, AuthProvider, useAuth } from "../../../contexts/AuthContext.js";
import AppShell from "../../../components/AppShell.js";
import ChangePassword from "../../../pages/ChangePassword.js";
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

function LogoutProbe() {
  const { user, logout } = useAuth();
  const [error, setError] = useState<string | null>(null);
  return (
    <div>
      <span data-testid="current-user">{user ? user.name : "signed-out"}</span>
      {error && <div role="alert">{error}</div>}
      <button
        onClick={() => {
          setError(null);
          logout().catch(() => setError("logout-failed"));
        }}
      >
        probe logout
      </button>
    </div>
  );
}

function LocationDisplay() {
  return <span data-testid="location">{useLocation().pathname}</span>;
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe("logout failure keeps auth state (Issue #45)", () => {
  it("AuthContext: rejected logoutUser keeps user and rejects", async () => {
    const user = userEvent.setup();
    vi.mocked(api.getCurrentUser).mockResolvedValue({ user: activeUser });
    vi.mocked(api.logoutUser).mockRejectedValue({ status: 500, body: null });
    render(
      <MemoryRouter>
        <AuthProvider>
          <LogoutProbe />
        </AuthProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByTestId("current-user")).toHaveTextContent("Alice Example");
    await user.click(screen.getByRole("button", { name: "probe logout" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("logout-failed");
    expect(screen.getByTestId("current-user")).toHaveTextContent("Alice Example");
    expect(api.logoutUser).toHaveBeenCalled();
  });

  it("AuthContext: resolved logoutUser clears user", async () => {
    const user = userEvent.setup();
    vi.mocked(api.getCurrentUser).mockResolvedValue({ user: activeUser });
    vi.mocked(api.logoutUser).mockResolvedValue(undefined);
    render(
      <MemoryRouter>
        <AuthProvider>
          <LogoutProbe />
        </AuthProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByTestId("current-user")).toHaveTextContent("Alice Example");
    await user.click(screen.getByRole("button", { name: "probe logout" }));

    await waitFor(() =>
      expect(screen.getByTestId("current-user")).toHaveTextContent("signed-out"),
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("AppShell: failing logout keeps menu/user visible, shows failure, stays on page", async () => {
    const user = userEvent.setup();
    const logoutMock = vi.fn().mockRejectedValue({ status: 500, body: null });
    render(
      <MemoryRouter initialEntries={["/create"]}>
        <AuthContext.Provider
          value={{ user: activeUser, loading: false, login: vi.fn(), logout: logoutMock, refresh: vi.fn() }}
        >
          <AppShell>
            <p>child marker</p>
          </AppShell>
          <LocationDisplay />
        </AuthContext.Provider>
      </MemoryRouter>,
    );

    await user.click(screen.getByRole("button", { name: /user menu/i }));
    await user.click(screen.getByRole("menuitem", { name: "Logout" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/logout failed/i);
    expect(screen.getByText(/Alice Example/)).toBeInTheDocument();
    expect(screen.getByText("child marker")).toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent("/create");
    expect(logoutMock).toHaveBeenCalled();
  });

  it("AppShell: successful logout navigates away", async () => {
    const user = userEvent.setup();
    const logoutMock = vi.fn().mockResolvedValue(undefined);
    render(
      <MemoryRouter initialEntries={["/create"]}>
        <AuthContext.Provider
          value={{ user: activeUser, loading: false, login: vi.fn(), logout: logoutMock, refresh: vi.fn() }}
        >
          <Routes>
            <Route
              path="/create"
              element={
                <AppShell>
                  <p>child marker</p>
                </AppShell>
              }
            />
            <Route path="/my-tickets" element={<p>my tickets page</p>} />
          </Routes>
          <LocationDisplay />
        </AuthContext.Provider>
      </MemoryRouter>,
    );

    await user.click(screen.getByRole("button", { name: /user menu/i }));
    await user.click(screen.getByRole("menuitem", { name: "Logout" }));

    await waitFor(() =>
      expect(screen.getByTestId("location")).toHaveTextContent("/my-tickets"),
    );
    expect(await screen.findByText("my tickets page")).toBeInTheDocument();
  });

  it("ChangePassword gate: failing logout shows error and stays on screen", async () => {
    const user = userEvent.setup();
    const logoutMock = vi.fn().mockRejectedValue({ status: 500, body: null });
    render(
      <MemoryRouter>
        <AuthContext.Provider
          value={{
            user: { ...activeUser, mustChangePassword: true },
            loading: false,
            login: vi.fn(),
            logout: logoutMock,
            refresh: vi.fn().mockResolvedValue(undefined),
          }}
        >
          <ChangePassword />
        </AuthContext.Provider>
      </MemoryRouter>,
    );

    await user.click(screen.getByRole("button", { name: "Logout" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/logout failed/i);
    expect(screen.getByRole("heading", { name: "Change Password" })).toBeInTheDocument();
    expect(logoutMock).toHaveBeenCalled();
  });
});
