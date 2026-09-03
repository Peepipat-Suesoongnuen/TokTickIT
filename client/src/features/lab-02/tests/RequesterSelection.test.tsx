import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import App from "../../../App.js";
import RequesterSelection from "../../../pages/RequesterSelection.js";
import { RequesterProvider } from "../../../contexts/RequesterContext.js";
import * as api from "../../../api.js";

vi.mock("../../../api.js");

const requesterA = { id: 101, name: "Alpha Requester", email: "alpha@test.local" };
const requesterB = { id: 202, name: "Beta Requester", email: "beta@test.local" };
const emptyMeta = {
  page: 1,
  pageSize: 10,
  totalCount: 0,
  totalPages: 0,
  hasNextPage: false,
  hasPreviousPage: false,
};

function renderSelection() {
  return render(
    <MemoryRouter>
      <RequesterProvider>
        <RequesterSelection />
      </RequesterProvider>
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

describe("Requester Selection release coverage", () => {
  it("UI-15 guards ticket routes with Requester Selection when no requester is selected", async () => {
    vi.mocked(api.fetchRequesters).mockResolvedValue([requesterA]);

    renderApp("/tickets/999");

    expect(await screen.findByLabelText(/Development Requester/i)).toBeInTheDocument();
    expect(screen.queryByLabelText("Ticket Number")).not.toBeInTheDocument();
  });

  it("UI-21 shows loading state while requesters are pending", () => {
    vi.mocked(api.fetchRequesters).mockImplementation(() => new Promise(() => {}));

    renderSelection();

    expect(screen.getByRole("status", { name: "Loading" })).toBeInTheDocument();
    expect(screen.getAllByText("Loading requesters…").length).toBeGreaterThanOrEqual(1);
  });

  it("UI-17 renders the active-only API response and the zero-result empty state", async () => {
    vi.mocked(api.fetchRequesters).mockResolvedValueOnce([requesterA, requesterB]);
    const first = renderSelection();

    const select = await screen.findByLabelText(/Development Requester/i);
    expect(select).toHaveTextContent("Alpha Requester (alpha@test.local)");
    expect(select).toHaveTextContent("Beta Requester (beta@test.local)");

    first.unmount();
    vi.mocked(api.fetchRequesters).mockResolvedValueOnce([]);
    renderSelection();
    expect(await screen.findByText("No active requesters available")).toBeInTheDocument();
  });

  it("UI-17 shows a safe failure state and Retry can recover", async () => {
    const user = userEvent.setup();
    vi.mocked(api.fetchRequesters)
      .mockRejectedValueOnce(new Error("Unable to connect to TokTickIT API"))
      .mockResolvedValueOnce([requesterB]);

    renderSelection();
    expect(await screen.findByText("Unable to connect to TokTickIT API")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("Beta Requester (beta@test.local)")).toBeInTheDocument();
  });

  it("UI-16 changes Requester A to B and reloads requester-specific My Tickets data with B", async () => {
    const user = userEvent.setup();
    localStorage.setItem("toktickit.requester", JSON.stringify(requesterA));
    vi.mocked(api.fetchCategories).mockResolvedValue([]);
    vi.mocked(api.fetchRequesters).mockResolvedValue([requesterA, requesterB]);
    vi.mocked(api.listTickets).mockResolvedValue({ data: [], meta: emptyMeta });

    renderApp();

    expect(await screen.findByText("Alpha Requester")).toBeInTheDocument();
    await waitFor(() =>
      expect(api.listTickets).toHaveBeenCalledWith(expect.objectContaining({ requesterId: requesterA.id })),
    );

    await user.click(screen.getByRole("button", { name: "Change Requester" }));
    const select = await screen.findByLabelText(/Development Requester/i);
    await user.selectOptions(select, String(requesterB.id));
    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(await screen.findByText("Beta Requester")).toBeInTheDocument();
    await waitFor(() =>
      expect(api.listTickets).toHaveBeenCalledWith(expect.objectContaining({ requesterId: requesterB.id })),
    );
  });
});
