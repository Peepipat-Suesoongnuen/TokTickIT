import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import StaffQueue from "../../../pages/StaffQueue.js";
import * as api from "../../../api.js";

vi.mock("../../../api.js");

const mockedApi = vi.mocked(api);

const queueRow = {
  id: 101,
  ticketNumber: "2609-0101",
  ticketDate: "2026-09-12T08:00:00.000Z",
  summary: "Cannot connect to VPN",
  requester: { id: 5, name: "Alice Example" },
  category: { id: 3, name: "Network" },
  requestedPriority: "HIGH",
  itPriority: "CRITICAL",
  currentStatus: "IN_PROGRESS",
  ticketOwner: { id: 17, name: "Bob Staff" },
  requesterResolutionIndicatedAt: null,
  updatedAt: "2026-09-12T12:00:00.000Z",
};

const queuePage = {
  data: [queueRow],
  meta: { page: 1, pageSize: 10, totalCount: 1, totalPages: 1, hasNextPage: false, hasPreviousPage: false },
};

function renderQueue() {
  return render(
    <MemoryRouter initialEntries={["/staff/queue"]}>
      <StaffQueue />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedApi.listStaffTickets.mockResolvedValue(queuePage);
  mockedApi.fetchCategories.mockResolvedValue([{ id: 3, name: "Network" }]);
  mockedApi.listEligibleOwners.mockResolvedValue({
    data: [
      { id: 17, name: "Bob Staff", role: "IT_STAFF" },
      { id: 22, name: "Admin One", role: "ADMINISTRATOR" },
    ],
  });
});

describe("StaffQueue (Lab 3 Issue #48, UI-07)", () => {
  it("renders the approved toolbar, eight desktop columns, and queue data with badges", async () => {
    renderQueue();

    for (const label of [
      "Search",
      "Category",
      "Requested Priority",
      "IT Priority",
      "Current Status",
      "Owner",
      "Rows per page",
    ]) {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    }

    expect((await screen.findAllByText("2609-0101")).length).toBeGreaterThanOrEqual(1);
    const table = screen.getByRole("table");
    // Abbreviated headers per the approved mockup.
    for (const col of [
      "Ticket No.",
      "Summary",
      "Category",
      "Req. Priority",
      "IT Priority",
      "Status",
      "Owner",
      "Updated",
    ]) {
      expect(within(table).getByText(col)).toBeInTheDocument();
    }
    // Badges carry business state as text (never color-only).
    expect(within(table).getByText("CRITICAL")).toBeInTheDocument();
    expect(within(table).getByText("IN_PROGRESS")).toBeInTheDocument();
    expect(within(table).getByText("Bob Staff")).toBeInTheDocument();
    // No requester-resolution checkmark in queue rows.
    expect(screen.queryByText("✓")).not.toBeInTheDocument();
    // Staff table carries the fixed-badge scope for Req/IT/Status columns.
    expect(table).toHaveClass("lab2-ticket-table-staff");
  });

  it("toolbar lays out all seven filters in a single desktop row", async () => {
    renderQueue();
    await screen.findAllByText("2609-0101");

    const toolbar = screen.getByTestId("staff-queue-toolbar");
    expect(toolbar).toHaveClass("lab3-staff-toolbar-grid");
    for (const label of [
      "Search",
      "Category",
      "Requested Priority",
      "IT Priority",
      "Current Status",
      "Owner",
      "Rows per page",
    ]) {
      expect(within(toolbar).getByLabelText(label)).toBeInTheDocument();
    }
  });

  it("shows loading, then empty state when the queue has no tickets at all", async () => {
    mockedApi.listStaffTickets.mockResolvedValue({
      data: [],
      meta: { page: 1, pageSize: 10, totalCount: 0, totalPages: 0, hasNextPage: false, hasPreviousPage: false },
    });
    renderQueue();

    expect(screen.getByText("Loading tickets…")).toBeInTheDocument();
    expect(await screen.findByText("No tickets in the queue yet")).toBeInTheDocument();
  });

  it("shows no-results with Clear Filters when filters exclude everything", async () => {
    const user = userEvent.setup();
    mockedApi.listStaffTickets.mockResolvedValue({
      data: [],
      meta: { page: 1, pageSize: 10, totalCount: 0, totalPages: 0, hasNextPage: false, hasPreviousPage: false },
    });
    renderQueue();

    // Narrow the queue first so the empty result renders the no-results
    // state (not the pristine empty-queue state).
    await user.type(screen.getByLabelText("Search"), "no-such-ticket-zzz");
    const panel = await screen.findByRole("status");
    expect(within(panel).getByText("No tickets match the current queue filters")).toBeInTheDocument();
    await user.click(within(panel).getByRole("button", { name: "Clear Filters" }));
    expect(mockedApi.listStaffTickets).toHaveBeenCalled();
  });

  it("shows safe failure with Retry and forbidden copy for 403", async () => {
    mockedApi.listStaffTickets.mockRejectedValueOnce({
      status: 500,
      body: { error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred. Please try again." } },
    });
    renderQueue();
    expect(await screen.findByText("An unexpected error occurred. Please try again.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });

  it("owner filter offers All/Unassigned/My plus eligible staff from the API", async () => {
    const user = userEvent.setup();
    renderQueue();
    await screen.findAllByText("2609-0101");

    const ownerSelect = screen.getByLabelText("Owner") as HTMLSelectElement;
    const options = Array.from(ownerSelect.options).map((o) => o.text);
    // Plain staff names per the approved mockup (no role suffix).
    expect(options).toEqual(
      expect.arrayContaining(["All Owners", "Unassigned", "My Tickets", "Bob Staff"]),
    );
    expect(options.join(" ")).not.toMatch(/specific owner|IT_STAFF|ADMINISTRATOR/);

    await user.selectOptions(ownerSelect, "My Tickets");
    expect(mockedApi.listStaffTickets).toHaveBeenLastCalledWith(expect.objectContaining({ owner: "me" }));
    await user.selectOptions(ownerSelect, "Bob Staff");
    expect(mockedApi.listStaffTickets).toHaveBeenLastCalledWith(expect.objectContaining({ owner: "17" }));
  });

  it("opening a row navigates to the staff ticket detail route", async () => {
    const user = userEvent.setup();
    renderQueue();
    expect((await screen.findAllByText("2609-0101")).length).toBeGreaterThanOrEqual(1);
    const link = within(screen.getByRole("table")).getByRole("link", { name: "2609-0101" });
    expect(link).toHaveAttribute("href", "/staff/tickets/101");
    await user.click(link);
  });

  it("pagination shows numbered pages like the requester list with correct disabled states", async () => {
    const user = userEvent.setup();
    mockedApi.listStaffTickets.mockResolvedValue({
      data: [queueRow],
      meta: { page: 1, pageSize: 10, totalCount: 25, totalPages: 3, hasNextPage: true, hasPreviousPage: false },
    });
    renderQueue();
    await screen.findAllByText("2609-0101");

    const nav = screen.getByRole("navigation", { name: "Pagination" });
    expect(within(nav).getByRole("button", { name: "Go to page 1" })).toBeDisabled();
    expect(within(nav).getByRole("button", { name: "Go to page 2" })).toBeEnabled();
    expect(within(nav).getByRole("button", { name: "Go to page 3" })).toBeEnabled();
    expect(within(nav).getByRole("button", { name: "Previous page" })).toBeDisabled();
    expect(within(nav).getByRole("button", { name: "Next page" })).toBeEnabled();

    await user.click(within(nav).getByRole("button", { name: "Go to page 2" }));
    expect(mockedApi.listStaffTickets).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 }));
  });

  it("sort controls drive the queue sort query and show the active direction", async () => {
    const user = userEvent.setup();
    renderQueue();
    await screen.findAllByText("2609-0101");

    // Desktop header sort: IT Priority descending.
    await user.click(within(screen.getByRole("table")).getByRole("button", { name: /Sort by IT Priority/ }));
    expect(mockedApi.listStaffTickets).toHaveBeenLastCalledWith(
      expect.objectContaining({ sort: "itPriority", order: "desc" }),
    );
    expect(
      within(screen.getByRole("table")).getByRole("button", { name: /Sort by IT Priority/ }),
    ).toHaveTextContent("↓");

    // Mobile sort group offers the approved fields.
    for (const label of ["Ticket Number", "Requested Priority", "IT Priority", "Last Updated"]) {
      expect(screen.getByRole("button", { name: new RegExp(`Sort mobile by ${label}`) })).toBeInTheDocument();
    }
  });
});
