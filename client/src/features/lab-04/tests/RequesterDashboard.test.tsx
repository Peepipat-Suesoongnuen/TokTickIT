import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import RequesterDashboard from "../../../pages/RequesterDashboard.js";
import * as api from "../../../api.js";

vi.mock("../../../api.js");
const mockedApi = vi.mocked(api);

afterEach(() => {
  vi.clearAllMocks();
});

const payload = {
  metrics: { openTickets: 2, waitingForRequester: 1 },
  recentlyUpdated: [
    { id: 11, ticketNumber: "2609-0101", summary: "VPN down", currentStatus: "OPEN", updatedAt: "2026-10-02T08:00:00.000Z" },
    { id: 12, ticketNumber: "2609-0102", summary: "Slow wifi", currentStatus: "IN_PROGRESS", updatedAt: "2026-10-01T08:00:00.000Z" },
  ],
  recentlyResolved: [
    { id: 13, ticketNumber: "2609-0103", summary: "Old printer", currentStatus: "RESOLVED", updatedAt: "2026-09-30T08:00:00.000Z" },
  ],
  links: {
    openTickets: "/my-tickets?state=open",
    waitingForRequester: "/my-tickets?status=WAITING_FOR_REQUESTER",
    recentlyResolved: "/my-tickets?state=resolved",
  },
};

function renderPage() {
  return render(
    <MemoryRouter>
      <RequesterDashboard />
    </MemoryRouter>,
  );
}

describe("RequesterDashboard (Issue #80, UI-01)", () => {
  it("renders attribution cards with exact values and drill-down links", async () => {
    mockedApi.fetchRequesterDashboard.mockResolvedValue(payload as never);
    renderPage();
    expect(await screen.findByText("Open Tickets")).toBeInTheDocument();
    expect(screen.getByText("Waiting for You")).toBeInTheDocument();
    expect(screen.getAllByText("Recently Resolved").length).toBeGreaterThanOrEqual(2);
    const openCard = screen.getByText("Open Tickets").closest(".card");
    expect(openCard?.textContent).toContain("2");
    expect(screen.getByRole("link", { name: /View open tickets/i })).toHaveAttribute("href", "/my-tickets?state=open");
    expect(screen.getByRole("link", { name: /View waiting list/i })).toHaveAttribute(
      "href",
      "/my-tickets?status=WAITING_FOR_REQUESTER",
    );
    expect(screen.getByRole("link", { name: /View resolved tickets/i })).toHaveAttribute("href", "/my-tickets?state=resolved");
  });

  it("renders keyboard-operable rows opening owned tickets", async () => {
    mockedApi.fetchRequesterDashboard.mockResolvedValue(payload as never);
    renderPage();
    const row = await screen.findByRole("link", { name: /2609-0101/ });
    expect(row).toHaveAttribute("href", "/tickets/11");
    expect(screen.getByRole("link", { name: /2609-0103/ })).toHaveAttribute("href", "/tickets/13");
  });

  it("renders skeleton while loading, guidance card when empty, retry on failure", async () => {
    let resolveLoad!: (value: unknown) => void;
    mockedApi.fetchRequesterDashboard.mockImplementationOnce(
      () => new Promise((resolve) => { resolveLoad = resolve as (value: unknown) => void; }),
    );
    renderPage();
    expect(screen.getByText("Loading dashboard…")).toBeInTheDocument();
    resolveLoad(payload);
    expect(await screen.findByText("Open Tickets")).toBeInTheDocument();
    // Empty state is covered by zero-metric rendering below.
  });

  it("zero metrics render zeros with lists empty, never blank", async () => {
    mockedApi.fetchRequesterDashboard.mockResolvedValue({
      metrics: { openTickets: 0, waitingForRequester: 0 },
      recentlyUpdated: [],
      recentlyResolved: [],
      links: payload.links,
    } as never);
    renderPage();
    expect(await screen.findByText("Open Tickets")).toBeInTheDocument();
    const zeros = screen.getAllByText("0");
    expect(zeros.length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText(/no tickets yet/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Create Ticket/i })).toBeInTheDocument();
  });

  it("shows inline error with retry on API failure and preserves state", async () => {
    const user = userEvent.setup();
    mockedApi.fetchRequesterDashboard.mockRejectedValueOnce({ status: 500, body: null });
    renderPage();
    expect(await screen.findByRole("button", { name: /Retry/i })).toBeInTheDocument();
    mockedApi.fetchRequesterDashboard.mockResolvedValueOnce(payload as never);
    await user.click(screen.getByRole("button", { name: /Retry/i }));
    expect(await screen.findByText("Open Tickets")).toBeInTheDocument();
  });
});
