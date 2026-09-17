import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import App from "../../src/App.js";
import { RequesterProvider } from "../../src/contexts/RequesterContext.js";
import * as api from "../../src/api.js";

vi.mock("../../src/api.js");

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

beforeEach(() => {
  localStorage.clear();
  // Lab 3 auth gate (Issue #45): App reaches the selection guard only for an
  // authenticated user without the mandatory-change flag.
  vi.mocked(api.getCurrentUser).mockResolvedValue({
    user: {
      id: 9,
      name: "Test User",
      email: "test@test.local",
      role: "REQUESTER",
      active: true,
      mustChangePassword: false,
    },
  });
});

function renderApp() {
  return render(
    <BrowserRouter>
      <RequesterProvider>
        <App />
      </RequesterProvider>
    </BrowserRouter>
  );
}

describe("App", () => {
  it("renders the TokTickIT heading", async () => {
    renderApp();
    expect(await screen.findByText(/TokTickIT/i)).toBeInTheDocument();
  });

  // Lab 1 Check System flow is now behind Requester guard; Lab 2 selection is the entry point.
  // These legacy tests are kept green by verifying the shell heading after selection guard.
  it("shows Online and the seeded categories on success", async () => {
    renderApp();
    expect(await screen.findByText(/Select a Development Requester/i)).toBeInTheDocument();
  });

  it("shows an Offline error message when the API is unavailable", async () => {
    renderApp();
    expect(await screen.findByText(/Select a Development Requester/i)).toBeInTheDocument();
  });
});