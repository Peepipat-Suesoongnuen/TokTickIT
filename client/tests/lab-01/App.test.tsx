import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import App from "../../src/App.js";
import * as api from "../../src/api.js";

vi.mock("../../src/api.js");

const activeUser = {
  id: 9,
  name: "Test User",
  email: "test@test.local",
  role: "REQUESTER",
  active: true,
  mustChangePassword: false,
};

const emptyList = {
  data: [],
  meta: {
    page: 1,
    pageSize: 10,
    totalCount: 0,
    totalPages: 0,
    hasNextPage: false,
    hasPreviousPage: false,
  },
};

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

beforeEach(() => {
  localStorage.clear();
  vi.mocked(api.getCurrentUser).mockResolvedValue({ user: activeUser });
  vi.mocked(api.fetchCategories).mockResolvedValue([]);
  vi.mocked(api.listTickets).mockResolvedValue(emptyList);
});

function renderApp() {
  return render(
    <BrowserRouter>
      <App />
    </BrowserRouter>
  );
}

describe("App (Issue #46 auth-first, no selector)", () => {
  it("authenticated app renders requester nav WITHOUT any selector screen", async () => {
    renderApp();

    // Role nav shows Requester destinations.
    expect(await screen.findByRole("link", { name: "My Tickets" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Create Ticket" })).toBeInTheDocument();

    // No requester-switching UI remains: identity comes from auth context only.
    expect(screen.queryByLabelText(/Development Requester/i)).not.toBeInTheDocument();
    expect(screen.queryByText("Development Requester")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Change Requester" })).not.toBeInTheDocument();
  });

  it("ticket pages call fetchers WITHOUT requesterId", async () => {
    renderApp();

    await waitFor(() => expect(api.listTickets).toHaveBeenCalled());
    for (const call of vi.mocked(api.listTickets).mock.calls) {
      expect(call[0]).not.toHaveProperty("requesterId");
    }
  });

  it("mustChangePassword user lands on the change-password gate, not the app", async () => {
    vi.mocked(api.getCurrentUser).mockResolvedValue({
      user: { ...activeUser, mustChangePassword: true },
    });
    renderApp();

    expect(await screen.findByRole("heading", { name: "Change Password" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "My Tickets" })).not.toBeInTheDocument();
  });

  it("unauthenticated user sees Login", async () => {
    vi.mocked(api.getCurrentUser).mockRejectedValue({ status: 401, body: null });
    renderApp();

    expect(await screen.findByRole("heading", { level: 1, name: "TokTickIT IT Service Desk" })).toBeInTheDocument();
    expect(screen.queryByLabelText(/Development Requester/i)).not.toBeInTheDocument();
  });
});
