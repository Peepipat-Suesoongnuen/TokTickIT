import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import StaffTicketDetail from "../../../pages/StaffTicketDetail.js";
import * as api from "../../../api.js";

vi.mock("../../../api.js");

const mockedApi = vi.mocked(api);

const detail = {
  id: 101,
  ticketNumber: "2609-0101",
  ticketDate: "2026-09-12T08:00:00.000Z",
  requester: { id: 5, name: "Alice Example", email: "alice@example.com" },
  category: { id: 3, name: "Network" },
  relatedSystem: { id: 2, name: "VPN" },
  summary: "Cannot connect to VPN",
  description: "VPN client fails to handshake.",
  requestedPriority: "HIGH",
  itPriority: "CRITICAL",
  currentStatus: "IN_PROGRESS",
  ticketOwner: { id: 17, name: "Bob Staff", role: "IT_STAFF" },
  requesterResolutionIndicatedAt: null,
  attachments: [
    {
      id: 55,
      originalFilename: "error.png",
      mimeType: "image/png",
      sizeBytes: 1024,
      removedAt: null,
      removedReason: null,
      createdAt: "2026-09-12T09:00:00.000Z",
    },
  ],
  createdAt: "2026-09-12T08:00:00.000Z",
  updatedAt: "2026-09-12T12:00:00.000Z",
};

function renderDetail() {
  return render(
    <MemoryRouter initialEntries={["/staff/tickets/101"]}>
      <Routes>
        <Route path="/staff/tickets/:id" element={<StaffTicketDetail />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedApi.getStaffTicketDetail.mockResolvedValue(detail);
  mockedApi.listEligibleOwners.mockResolvedValue({
    data: [
      { id: 17, name: "Bob Staff", role: "IT_STAFF" },
      { id: 22, name: "Admin One", role: "ADMINISTRATOR" },
    ],
  });
});

describe("StaffTicketDetail (Lab 3 Issue #48, UI-08)", () => {
  it("renders ticket information, breadcrumb, and the four-tab switcher", async () => {
    renderDetail();

    expect(await screen.findByRole("heading", { name: "Ticket 2609-0101" })).toBeInTheDocument();
    // Separate breadcrumb row below navigation per the locked layout.
    const breadcrumb = screen.getByRole("navigation", { name: "Breadcrumb" });
    expect(within(breadcrumb).getByRole("link", { name: "Ticket Queue" })).toHaveAttribute("href", "/staff/queue");
    expect(screen.getByRole("link", { name: "Back to Ticket Queue" })).toHaveAttribute("href", "/staff/queue");
    for (const tab of ["Public Comments", "Internal Notes", "Attachments", "Ticket Actions"]) {
      expect(screen.getByRole("tab", { name: tab })).toBeInTheDocument();
    }
    expect(screen.getByLabelText("Summary")).toHaveValue("Cannot connect to VPN");
    expect(screen.getByLabelText("Requester")).toHaveValue("Alice Example (alice@example.com)");
    // Abbreviated readonly labels per the mockup grid.
    expect(screen.getByText("Req. Priority")).toBeInTheDocument();
  });

  it("keeps Requested Priority read-only and offers only permitted next transitions", async () => {
    const user = userEvent.setup();
    renderDetail();
    await screen.findByRole("heading", { name: "Ticket 2609-0101" });

    await user.click(screen.getByRole("tab", { name: "Ticket Actions" }));
    // Requested Priority is display-only; IT Priority is an editable select.
    expect(screen.queryByLabelText("Requested Priority")).not.toBeInTheDocument();
    expect(screen.getByLabelText("IT Priority")).toHaveValue("CRITICAL");
    const statusSelect = screen.getByLabelText("Current Status");
    const options = Array.from((statusSelect as HTMLSelectElement).options).map((o) => o.value);
    // IN_PROGRESS permits WAITING_FOR_REQUESTER / RESOLVED / CANCELLED only.
    expect(options).toEqual(
      expect.arrayContaining(["WAITING_FOR_REQUESTER", "RESOLVED", "CANCELLED"]),
    );
    expect(options).not.toContain("CLOSED");
    expect(options).not.toContain("OPEN");
  });

  it("Q1-A: communication tabs show the Issue #49 placeholder and no composer", async () => {
    const user = userEvent.setup();
    renderDetail();
    await screen.findByRole("heading", { name: "Ticket 2609-0101" });

    await user.click(screen.getByRole("tab", { name: "Public Comments" }));
    expect(screen.getByText("Public comments arrive with Issue #49.")).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Internal Notes" }));
    expect(screen.getByText("Internal notes arrive with Issue #49.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Post Comment" })).not.toBeInTheDocument();
  });

  it("attachments tab lists requester files read-only with download and no upload", async () => {
    const user = userEvent.setup();
    renderDetail();
    await screen.findByRole("heading", { name: "Ticket 2609-0101" });

    await user.click(screen.getByRole("tab", { name: "Attachments" }));
    expect(screen.getByText("error.png · 1 KB")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Download error.png" })).toBeInTheDocument();
    expect(screen.queryByText(/upload/i)).not.toBeInTheDocument();
  });

  it("claim flow assigns the ticket and stale conflicts show actionable refresh copy", async () => {
    const user = userEvent.setup();
    mockedApi.getStaffTicketDetail.mockResolvedValue({
      ...detail,
      currentStatus: "NEW",
      ticketOwner: null,
    });
    renderDetail();
    await screen.findByRole("heading", { name: "Ticket 2609-0101" });

    await user.click(screen.getByRole("tab", { name: "Ticket Actions" }));
    mockedApi.claimStaffTicket.mockResolvedValue({
      ...detail,
      currentStatus: "OPEN",
      ticketOwner: { id: 17, name: "Bob Staff", role: "IT_STAFF" },
    });
    await user.click(screen.getByRole("button", { name: "Claim Ticket" }));
    expect(mockedApi.claimStaffTicket).toHaveBeenCalledWith(101);
    expect(await screen.findByText("Ticket claimed.")).toBeInTheDocument();

    // Stale conflict copy.
    mockedApi.assignStaffTicketOwner.mockRejectedValue({
      status: 409,
      body: { error: { code: "TICKET_STATE_CHANGED", message: "The ticket has changed. Refresh and try again." } },
    });
    const ownerSelect = screen.getByLabelText("Ticket Owner");
    await user.selectOptions(ownerSelect, "22");
    await user.click(screen.getByRole("button", { name: "Update Owner" }));
    expect(await screen.findByText("The ticket has changed. Refresh and try again.")).toBeInTheDocument();
  });

  it("owner-ineligible conflicts ask to reselect an eligible owner", async () => {
    const user = userEvent.setup();
    renderDetail();
    await screen.findByRole("heading", { name: "Ticket 2609-0101" });

    await user.click(screen.getByRole("tab", { name: "Ticket Actions" }));
    mockedApi.assignStaffTicketOwner.mockRejectedValue({
      status: 409,
      body: {
        error: {
          code: "OWNER_NOT_ELIGIBLE",
          message: "The selected ticket owner is no longer eligible. Refresh and try again.",
        },
      },
    });
    const ownerSelect = screen.getByLabelText("Ticket Owner");
    await user.selectOptions(ownerSelect, "22");
    await user.click(screen.getByRole("button", { name: "Update Owner" }));
    expect(
      await screen.findByText("The selected ticket owner is no longer eligible. Refresh and try again."),
    ).toBeInTheDocument();
  });

  it("leaves direct assign open but disables priority/status until claim", async () => {
    const user = userEvent.setup();
    mockedApi.getStaffTicketDetail.mockResolvedValue({
      ...detail,
      currentStatus: "NEW",
      ticketOwner: null,
    });
    renderDetail();
    await screen.findByRole("heading", { name: "Ticket 2609-0101" });

    await user.click(screen.getByRole("tab", { name: "Ticket Actions" }));
    // Direct assign stays available (first assign opens the ticket).
    expect(screen.getByLabelText("Ticket Owner")).toBeEnabled();
    expect(screen.getByLabelText("IT Priority")).toBeDisabled();
    expect(screen.getByLabelText("Current Status")).toBeDisabled();
    expect(screen.getByText("Claim first to begin work.")).toBeInTheDocument();
  });
});
