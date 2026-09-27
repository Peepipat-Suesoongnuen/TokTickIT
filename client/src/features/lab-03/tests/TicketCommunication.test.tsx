import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
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
  currentStatus: "OPEN",
  ticketOwner: { id: 17, name: "Bob Staff", role: "IT_STAFF" },
  requesterResolutionIndicatedAt: null,
  attachments: [],
  createdAt: "2026-09-12T08:00:00.000Z",
  updatedAt: "2026-09-12T12:00:00.000Z",
};

const notes = [
  {
    id: 21,
    author: { id: 17, name: "Bob Staff", role: "IT_STAFF" },
    content: "Device logs show repeated authentication failures.",
    createdAt: "2026-09-12T11:00:00.000Z",
  },
];

const comments = [
  {
    id: 81,
    author: { id: 5, name: "Alice Example", role: "REQUESTER" },
    content: "The problem still happens after restart.",
    createdAt: "2026-09-12T12:30:00.000Z",
  },
];

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
  mockedApi.listEligibleOwners.mockResolvedValue({ data: [] });
  mockedApi.listTicketComments.mockResolvedValue({ data: comments });
  mockedApi.listTicketNotes.mockResolvedValue({ data: notes });
});

describe("TicketCommunication (Lab 3 Issue #49, UI-09)", () => {
  it("staff Public Comments tab shows the timeline and compact 200-char composer", async () => {
    const user = userEvent.setup();
    renderDetail();
    await screen.findByRole("heading", { name: "Ticket 2609-0101" });

    await user.click(screen.getByRole("tab", { name: "Public Comments" }));
    expect(screen.getByText("Visible to Requester, IT Staff and Administrators.")).toBeInTheDocument();
    expect(screen.getByText("The problem still happens after restart.")).toBeInTheDocument();
    expect(screen.getByText("Alice Example")).toBeInTheDocument();

    const composer = screen.getByPlaceholderText("Add a public comment…");
    await user.type(composer, "Checking again.");
    expect(screen.getByText("15 / 200")).toBeInTheDocument();
  });

  it("staff Internal Notes tab is explicitly private with a multiline 2000-char composer", async () => {
    const user = userEvent.setup();
    mockedApi.postTicketNote.mockResolvedValue({
      id: 22,
      author: { id: 17, name: "Bob Staff", role: "IT_STAFF" },
      content: "Escalated to network ops.",
      createdAt: "2026-09-12T13:00:00.000Z",
    });
    renderDetail();
    await screen.findByRole("heading", { name: "Ticket 2609-0101" });

    await user.click(screen.getByRole("tab", { name: "Internal Notes" }));
    // Explicit words, never color-only distinction.
    expect(screen.getByText("Visible only to IT Staff and Administrators.")).toBeInTheDocument();
    expect(screen.getByText("Device logs show repeated authentication failures.")).toBeInTheDocument();

    const composer = screen.getByPlaceholderText("Add an internal note…");
    expect(composer.tagName).toBe("TEXTAREA");
    await user.type(composer, "Escalated to network ops.");
    expect(screen.getByText("25 / 2000")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add Note" }));
    expect(mockedApi.postTicketNote).toHaveBeenCalledWith(101, "Escalated to network ops.");
    expect(await screen.findByText("Escalated to network ops.")).toBeInTheDocument();
  });

  it("staff requester indication renders as plain text without a checkmark", async () => {
    mockedApi.getStaffTicketDetail.mockResolvedValue({
      ...detail,
      requesterResolutionIndicatedAt: "2026-09-12T12:40:00.000Z",
    });
    renderDetail();
    await screen.findByRole("heading", { name: "Ticket 2609-0101" });
    expect(screen.getByText("Problem appears resolved")).toBeInTheDocument();
    expect(screen.queryByText("✓")).not.toBeInTheDocument();
  });
});
