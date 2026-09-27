import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import StaffTicketDetail from "../../../pages/StaffTicketDetail.js";
import * as api from "../../../api.js";

// Issue #49 (Lab 3) — SEC-08 client side: user-authored comment/note
// content is rendered as plain text and never interpreted as executable
// HTML or script.
vi.mock("../../../api.js");

const mockedApi = vi.mocked(api);

const payload = "<script>alert(1)</script>";

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

beforeEach(() => {
  vi.clearAllMocks();
  mockedApi.getStaffTicketDetail.mockResolvedValue(detail);
  mockedApi.listEligibleOwners.mockResolvedValue({ data: [] });
  mockedApi.listTicketComments.mockResolvedValue({
    data: [{ id: 1, author: { id: 5, name: "Alice Example", role: "REQUESTER" }, content: payload, createdAt: "2026-09-12T12:30:00.000Z" }],
  });
  mockedApi.listTicketNotes.mockResolvedValue({
    data: [{ id: 2, author: { id: 17, name: "Bob Staff", role: "IT_STAFF" }, content: payload, createdAt: "2026-09-12T13:00:00.000Z" }],
  });
});

function renderDetail() {
  return render(
    <MemoryRouter initialEntries={["/staff/tickets/101"]}>
      <Routes>
        <Route path="/staff/tickets/:id" element={<StaffTicketDetail />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("communication secure rendering (SEC-08)", () => {
  it("renders script-like comment and note content as inert text", async () => {
    const user = userEvent.setup();
    renderDetail();
    await screen.findByRole("heading", { name: "Ticket 2609-0101" });

    await user.click(screen.getByRole("tab", { name: "Public Comments" }));
    expect(await screen.findByText(payload)).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Internal Notes" }));
    expect(await screen.findByText(payload)).toBeInTheDocument();

    // No executable script path exists anywhere in the rendered tree.
    expect(document.querySelector("script")).toBeNull();
  });
});
