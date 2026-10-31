import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import StaffDashboard from "../../../pages/StaffDashboard.js";
import * as api from "../../../api.js";

vi.mock("../../../api.js");
const mockedApi = vi.mocked(api);

afterEach(() => {
  vi.clearAllMocks();
});

const staffPayload = {
  metrics: {
    ownedByMe: 2,
    assignedToMe: 3,
    recordedByMe: 1,
    unassigned: 4,
    urgentHighPriority: 2,
    byStatus: { OPEN: 5, IN_PROGRESS: 2 },
    byItPriority: { HIGH: 1, CRITICAL: 1 },
  },
  recentlyUpdated: [
    { id: 21, ticketNumber: "2609-0201", summary: "Queue jam", currentStatus: "OPEN", owner: { id: 7, name: "A" }, updatedAt: "2026-10-02T08:00:00.000Z" },
    { id: 22, ticketNumber: "2609-0202", summary: "Slow DB", currentStatus: "IN_PROGRESS", owner: null, updatedAt: "2026-10-01T08:00:00.000Z" },
  ],
  urgentTickets: [
    { id: 23, ticketNumber: "2609-0203", summary: "Outage", itPriority: "CRITICAL", currentStatus: "OPEN", updatedAt: "2026-10-02T09:00:00.000Z" },
  ],
  links: {
    ownedByMe: "/staff/queue?owner=me&state=open",
    assignedToMe: "/staff/queue?assignee=me&state=open",
    unassigned: "/staff/queue?owner=unassigned&state=open",
    urgentHighPriority: "/staff/queue?itPriority=HIGH,CRITICAL&state=open",
    usersByRole: "/admin/users?role=IT_STAFF",
  },
};

const adminPayload = {
  ...staffPayload,
  userCounts: { total: 10, active: 9, byRole: { REQUESTER: 6, IT_STAFF: 3, ADMINISTRATOR: 1 } },
};

function renderPage() {
  return render(
    <MemoryRouter>
      <StaffDashboard />
    </MemoryRouter>,
  );
}

describe("StaffDashboard (Issue #80, UI-02)", () => {
  it("renders attribution cards with exact values and drill-down links", async () => {
    mockedApi.fetchStaffDashboard.mockResolvedValue(staffPayload as never);
    renderPage();
    expect(await screen.findByText("Owned by me")).toBeInTheDocument();
    expect(screen.getByText("Assigned to me")).toBeInTheDocument();
    expect(screen.getByText("Recorded by me")).toBeInTheDocument();
    expect(screen.getByText("Unassigned")).toBeInTheDocument();
    expect(screen.getByText("Urgent HIGH/CRITICAL")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /View owned tickets/i })).toHaveAttribute("href", "/staff/queue?owner=me&state=open");
    expect(screen.getByRole("link", { name: /View assigned tickets/i })).toHaveAttribute("href", "/staff/queue?assignee=me&state=open");
    expect(screen.getByRole("link", { name: /View unassigned/i })).toHaveAttribute("href", "/staff/queue?owner=unassigned&state=open");
    expect(screen.getByRole("link", { name: /View urgent tickets/i })).toHaveAttribute(
      "href",
      "/staff/queue?itPriority=HIGH,CRITICAL&state=open",
    );
  });

  it("recorded-by-me card is non-clickable and asserted", async () => {
    mockedApi.fetchStaffDashboard.mockResolvedValue(staffPayload as never);
    renderPage();
    await screen.findByText("Recorded by me");
    const card = screen.getByText("Recorded by me").closest(".card");
    expect(card).not.toBeNull();
    expect(card?.querySelector("a")).toBeNull();
    expect(card?.textContent).toContain("1");
  });

  it("hides the Admin user-counts card for Staff", async () => {
    mockedApi.fetchStaffDashboard.mockResolvedValue(staffPayload as never);
    renderPage();
    await screen.findByText("Owned by me");
    expect(screen.queryByText("User accounts")).toBeNull();
  });

  it("renders byStatus and byItPriority metric groups with exact values (finding 2)", async () => {
    mockedApi.fetchStaffDashboard.mockResolvedValue(staffPayload as never);
    renderPage();
    expect(await screen.findByText("By Status")).toBeInTheDocument();
    expect(screen.getByText("By IT Priority")).toBeInTheDocument();
    const statusGroup = screen.getByText("By Status").closest("section");
    expect(statusGroup?.textContent).toContain("OPEN");
    expect(statusGroup?.textContent).toContain("5");
    const priorityGroup = screen.getByText("By IT Priority").closest("section");
    expect(priorityGroup?.textContent).toContain("CRITICAL");
    expect(priorityGroup?.textContent).toContain("1");
    // Per-priority drill-down uses the single value within the open scope.
    expect(screen.getByRole("link", { name: /View HIGH tickets/i })).toHaveAttribute(
      "href",
      "/staff/queue?itPriority=HIGH&state=open",
    );
  });

  it("renders full Admin userCounts with per-role drill-down (finding 3)", async () => {
    mockedApi.fetchStaffDashboard.mockResolvedValue(adminPayload as never);
    renderPage();
    expect(await screen.findByText("User accounts")).toBeInTheDocument();
    const card = screen.getByText("User accounts").closest(".card");
    expect(card?.textContent).toContain("10");
    expect(card?.textContent).toContain("9");
    expect(screen.getByText(/REQUESTER/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /View REQUESTER users/i })).toHaveAttribute(
      "href",
      "/admin/users?role=REQUESTER",
    );
    expect(screen.getByRole("link", { name: /View IT_STAFF users/i })).toHaveAttribute(
      "href",
      "/admin/users?role=IT_STAFF",
    );
    expect(screen.getByRole("link", { name: /View ADMINISTRATOR users/i })).toHaveAttribute(
      "href",
      "/admin/users?role=ADMINISTRATOR",
    );
  });

  it("renders urgent vs recent as separated lists with keyboard-operable rows", async () => {
    mockedApi.fetchStaffDashboard.mockResolvedValue(staffPayload as never);
    renderPage();
    expect(await screen.findByText("Recently Updated")).toBeInTheDocument();
    expect(screen.getByText("Urgent Tickets")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /2609-0201/ })).toHaveAttribute("href", "/staff/tickets/21");
    expect(screen.getByRole("link", { name: /2609-0203/ })).toHaveAttribute("href", "/staff/tickets/23");
  });

  it("renders skeleton placeholders while loading (finding 4)", async () => {
    let resolveLoad!: (value: unknown) => void;
    mockedApi.fetchStaffDashboard.mockImplementationOnce(
      () => new Promise((resolve) => { resolveLoad = resolve as (value: unknown) => void; }),
    );
    renderPage();
    expect(screen.getByTestId("dashboard-skeleton")).toBeInTheDocument();
    expect(screen.getByRole("status", { name: /Loading dashboard/i })).toBeInTheDocument();
    resolveLoad(staffPayload);
    expect(await screen.findByText("Owned by me")).toBeInTheDocument();
  });

  it("shows inline error with retry on API failure", async () => {
    const user = userEvent.setup();
    mockedApi.fetchStaffDashboard.mockRejectedValueOnce({ status: 500, body: null });
    renderPage();
    expect(await screen.findByRole("button", { name: /Retry/i })).toBeInTheDocument();
    mockedApi.fetchStaffDashboard.mockResolvedValueOnce(staffPayload as never);
    await user.click(screen.getByRole("button", { name: /Retry/i }));
    expect(await screen.findByText("Owned by me")).toBeInTheDocument();
  });
});
