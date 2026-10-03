import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { ActionStatusBadge } from "../../../components/Badges.js";
import { ActionTable } from "../components/ActionTable.js";
import { ActionForm } from "../components/ActionForm.js";
import { ActionsTab } from "../components/ActionsTab.js";
import StaffTicketDetail from "../../../pages/StaffTicketDetail.js";
import TicketDetail from "../../../pages/TicketDetail.js";
import * as api from "../../../api.js";

vi.mock("../../../api.js");
const mockedApi = vi.mocked(api);

afterEach(() => {
  vi.clearAllMocks();
});

const tableRows = [
  {
    id: 11,
    ticketId: 7,
    description: "Second work item",
    result: "Done.",
    recordedBy: { id: 17, name: "Bob Staff" },
    assignedTo: { id: 22, name: "Amy Staff" },
    actionDate: "2026-10-02T08:00:00.000Z",
    followUpRequired: true,
    followUpNote: "Recheck.",
    attachmentNotes: null,
    status: "COMPLETED",
    cycle: 1,
    version: 3,
    createdAt: "2026-10-02T08:00:00.000Z",
    updatedAt: "2026-10-03T08:00:00.000Z",
  },
  {
    id: 9,
    ticketId: 7,
    description: "Restarted service",
    result: null,
    recordedBy: { id: 17, name: "Bob Staff" },
    assignedTo: null,
    actionDate: "2026-10-01T08:00:00.000Z",
    followUpRequired: false,
    followUpNote: null,
    attachmentNotes: null,
    status: "PLANNED",
    cycle: 1,
    version: 1,
    createdAt: "2026-10-01T08:00:00.000Z",
    updatedAt: "2026-10-01T08:00:00.000Z",
  },
];

const owners = [
  { id: 17, name: "Bob Staff", role: "IT_STAFF" },
  { id: 22, name: "Amy Staff", role: "IT_STAFF" },
];

describe("Actions Taken table + badges (Issue #78, UI-03, STYLE-01)", () => {
  it("renders Date/Description/Result/Recorded By/Assignee/Follow-Up/Status/Version columns in given order", async () => {
    render(<ActionTable actions={tableRows as never} />);
    for (const header of ["Date", "Description", "Result", "Recorded By", "Assignee", "Follow-Up", "Status", "Version"]) {
      expect(screen.getByRole("columnheader", { name: header })).toBeInTheDocument();
    }
    const rows = screen.getAllByRole("row");
    // Header + 2 body rows, server-stable order preserved (no client re-sort).
    expect(rows).toHaveLength(3);
    expect(within(rows[1]).getByText("Second work item")).toBeInTheDocument();
    expect(within(rows[2]).getByText("Restarted service")).toBeInTheDocument();
    expect(screen.getByText("Amy Staff")).toBeInTheDocument();
    expect(screen.getByText("Recheck.")).toBeInTheDocument();
  });

  it("badges every lifecycle status with a distinct class and never OPEN", async () => {
    const { rerender } = render(<ActionStatusBadge value="PLANNED" />);
    expect(screen.getByText("PLANNED")).toHaveClass("badge-action-planned");
    for (const [status, cls] of [["IN_PROGRESS", "badge-action-in-progress"], ["COMPLETED", "badge-action-completed"], ["CANCELLED", "badge-action-cancelled"]] as const) {
      rerender(<ActionStatusBadge value={status} />);
      expect(screen.getByText(status)).toHaveClass(cls);
    }
    const classes = ["badge-action-planned", "badge-action-in-progress", "badge-action-completed", "badge-action-cancelled"];
    expect(new Set(classes).size).toBe(4);
    expect(document.body.textContent).not.toMatch(/\bOPEN\b/);
  });

  it("renders the empty state when there are no actions", async () => {
    render(<ActionTable actions={[]} />);
    expect(screen.getByText("No actions taken yet.")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("collapses to cards on mobile with full data parity and responsive classes", async () => {
    render(<ActionTable actions={tableRows as never} />);
    const tableWrap = document.querySelector(".table-responsive");
    expect(tableWrap?.className).toMatch(/d-none/);
    expect(tableWrap?.className).toMatch(/d-md-block/);
    const cards = document.querySelector(".actions-cards");
    expect(cards).not.toBeNull();
    expect(cards?.className).toMatch(/d-md-none/);
    const cardRegion = within(cards as HTMLElement);
    const labeled = (label: string, value: string) => (_content: string, el: Element | null) =>
      typeof el?.className === "string" &&
      el.className.includes("small text-secondary") &&
      (el?.textContent ?? "").replace(/\s+/g, " ").includes(`${label}: ${value}`);
    expect(cardRegion.getByText("Second work item")).toBeInTheDocument();
    expect(cardRegion.getByText(labeled("Assignee", "Amy Staff"))).toBeInTheDocument();
    expect(cardRegion.getByText("COMPLETED")).toHaveClass("badge-action-completed");
    expect(cardRegion.getByText("Restarted service")).toBeInTheDocument();
    expect(cardRegion.getByText(labeled("Assignee", "Recorder accountable"))).toBeInTheDocument();
  });
});

describe("ActionForm create (Issue #78, UI-03)", () => {
  it("sends an explicit actionDate and a stable clientRequestId, once per double submit", async () => {
    const user = userEvent.setup();
    let resolveCreate!: (value: unknown) => void;
    mockedApi.createTicketAction.mockImplementationOnce(
      () => new Promise((resolve) => { resolveCreate = resolve as (value: unknown) => void; }),
    );
    const onSaved = vi.fn();
    render(<ActionForm ticketId={7} owners={owners} onSaved={onSaved} onCancel={() => undefined} />);
    await user.type(screen.getByLabelText(/Description/i), "Restarted service");
    // Auto-tick fills the work datetime; the field is never omitted.
    await user.click(screen.getByRole("button", { name: /use current time/i }));
    const dateInput = screen.getByLabelText(/Work date and time/i) as HTMLInputElement;
    expect(dateInput.value).not.toBe("");
    // Two clicks in the same tick while the first request is in flight.
    const createButton = screen.getByRole("button", { name: /^Create action$/i });
    fireEvent.click(createButton);
    fireEvent.click(createButton);
    expect(mockedApi.createTicketAction).toHaveBeenCalledTimes(1);
    resolveCreate({ action: tableRows[1], replayed: false });
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    const [ticketId, payload] = mockedApi.createTicketAction.mock.calls[0] as unknown as [number, Record<string, unknown>];
    expect(ticketId).toBe(7);
    expect(payload.description).toBe("Restarted service");
    expect(typeof payload.actionDate).toBe("string");
    expect(payload.actionDate as string).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(typeof payload.clientRequestId).toBe("string");
    expect(onSaved).toHaveBeenCalledTimes(1);
  });

  it("reuses the same clientRequestId when retrying after a recoverable failure and keeps the form", async () => {
    const user = userEvent.setup();
    mockedApi.createTicketAction
      .mockRejectedValueOnce({ status: 500, body: null })
      .mockResolvedValueOnce({ action: tableRows[1] as never, replayed: false });
    render(<ActionForm ticketId={7} owners={owners} onSaved={() => undefined} onCancel={() => undefined} />);
    await user.type(screen.getByLabelText(/Description/i), "Restarted service");
    await user.click(screen.getByRole("button", { name: /use current time/i }));
    await user.click(screen.getByRole("button", { name: /^Create action$/i }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    // Form data preserved for recovery.
    expect(screen.getByLabelText(/Description/i)).toHaveValue("Restarted service");
    await user.click(screen.getByRole("button", { name: /^Create action$/i }));
    expect(mockedApi.createTicketAction).toHaveBeenCalledTimes(2);
    const first = mockedApi.createTicketAction.mock.calls[0][1] as unknown as Record<string, unknown>;
    const second = mockedApi.createTicketAction.mock.calls[1][1] as unknown as Record<string, unknown>;
    expect(second.clientRequestId).toBe(first.clientRequestId);
    expect(second.actionDate).toBe(first.actionDate);
  });

  it("requires the follow-up note only when follow-up is flagged", async () => {
    const user = userEvent.setup();
    render(<ActionForm ticketId={7} owners={owners} onSaved={() => undefined} onCancel={() => undefined} />);
    await user.type(screen.getByLabelText(/Description/i), "Check logs");
    await user.click(screen.getByRole("button", { name: /use current time/i }));
    await user.click(screen.getByLabelText(/Require follow-up/i));
    await user.click(screen.getByRole("button", { name: /^Create action$/i }));
    expect(await screen.findByText(/Follow-up note is required/i)).toBeInTheDocument();
    expect(mockedApi.createTicketAction).not.toHaveBeenCalled();
    await user.type(screen.getByLabelText(/Follow-up note/i), "Recheck tomorrow.");
    await user.click(screen.getByRole("button", { name: /^Create action$/i }));
    expect(mockedApi.createTicketAction).toHaveBeenCalledTimes(1);
    expect((mockedApi.createTicketAction.mock.calls[0][1] as unknown as Record<string, unknown>).followUpRequired).toBe(true);
  });

  it("sends the chosen assignee and supports unassigned (recorder accountable)", async () => {
    const user = userEvent.setup();
    mockedApi.createTicketAction.mockResolvedValue({ action: tableRows[1] as never, replayed: false });
    render(<ActionForm ticketId={7} owners={owners} onSaved={() => undefined} onCancel={() => undefined} />);
    await user.type(screen.getByLabelText(/Description/i), "Check logs");
    await user.click(screen.getByRole("button", { name: /use current time/i }));
    await user.selectOptions(screen.getByLabelText(/Assignee/i), "22");
    await user.click(screen.getByRole("button", { name: /^Create action$/i }));
    expect((mockedApi.createTicketAction.mock.calls[0][1] as unknown as Record<string, unknown>).assignedToId).toBe(22);
  });
});

describe("ActionForm edit (Issue #78, UI-03)", () => {
  const editable = {
    ...tableRows[1],
    description: "Restarted service",
    assignedToId: null,
    status: "PLANNED",
  };

  it("prefills from the action and saves with the displayed expectedVersion", async () => {
    const user = userEvent.setup();
    mockedApi.updateTicketAction.mockResolvedValue({ ...tableRows[1], description: "Restarted twice", version: 2 } as never);
    const onSaved = vi.fn();
    render(
      <ActionForm
        ticketId={7}
        owners={owners}
        initialAction={editable as never}
        onSaved={onSaved}
        onCancel={() => undefined}
      />,
    );
    expect(screen.getByLabelText(/Description/i)).toHaveValue("Restarted service");
    expect(screen.getByText("Editing action #9 (version 1)")).toBeInTheDocument();
    await user.clear(screen.getByLabelText(/Description/i));
    await user.type(screen.getByLabelText(/Description/i), "Restarted twice");
    await user.click(screen.getByRole("button", { name: /^Save changes$/i }));
    expect(mockedApi.updateTicketAction).toHaveBeenCalledTimes(1);
    const [id, payload] = mockedApi.updateTicketAction.mock.calls[0] as unknown as [number, Record<string, unknown>];
    expect(id).toBe(9);
    expect(payload.expectedVersion).toBe(1);
    expect(payload.description).toBe("Restarted twice");
    expect(onSaved).toHaveBeenCalledTimes(1);
  });

  it("keeps the form mounted with entries preserved when the server rejects the save", async () => {
    const user = userEvent.setup();
    mockedApi.updateTicketAction.mockRejectedValueOnce({ status: 400, body: { error: { code: "ACTION_DATE_OUT_OF_RANGE", message: "Date out of range." } } });
    render(
      <ActionForm ticketId={7} owners={owners} initialAction={editable as never} onSaved={() => undefined} onCancel={() => undefined} />,
    );
    await user.click(screen.getByRole("button", { name: /^Save changes$/i }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByLabelText(/Description/i)).toHaveValue("Restarted service");
    expect(mockedApi.updateTicketAction).toHaveBeenCalledTimes(1);
  });
});

describe("ActionsTab staff flows (Issue #78, UI-03)", () => {
  const events = [
    { id: 1, actionTakenId: 9, eventType: "CREATED", actor: { id: 17, name: "Bob Staff" }, occurredAt: "2026-10-01T08:00:00.000Z", payload: {}, requestId: "r1" },
  ];
  const confirmSpy = () => vi.spyOn(window, "confirm").mockReturnValue(true);

  function renderStaff(status = "IN_PROGRESS", actions = tableRows) {
    mockedApi.listTicketActions.mockResolvedValue({ actions: actions as never, meta: { count: actions.length } });
    return render(<ActionsTab ticketId={7} ticketStatus={status} mode="staff" owners={owners} />);
  }

  it("loads the list and offers record/start/edit/history controls", async () => {
    renderStaff();
    expect(screen.getByText("Loading actions…")).toBeInTheDocument();
    expect(await screen.findByRole("table")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Record action/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Start$/i })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^History$/i })).toHaveLength(2);
  });

  it("shows a retry control when loading fails", async () => {
    mockedApi.listTicketActions.mockRejectedValueOnce({ status: 500, body: null });
    const user = userEvent.setup();
    render(<ActionsTab ticketId={7} ticketStatus="IN_PROGRESS" mode="staff" owners={owners} />);
    expect(await screen.findByRole("button", { name: /Retry/i })).toBeInTheDocument();
    mockedApi.listTicketActions.mockResolvedValue({ actions: tableRows as never, meta: { count: 2 } });
    await user.click(screen.getByRole("button", { name: /Retry/i }));
    expect(await screen.findByRole("table")).toBeInTheDocument();
  });

  it("records an action end-to-end and refreshes the list with a success status", async () => {
    const user = userEvent.setup();
    renderStaff();
    expect(await screen.findByRole("table")).toBeInTheDocument();
    mockedApi.createTicketAction.mockResolvedValue({ action: tableRows[1] as never, replayed: false });
    await user.click(screen.getByRole("button", { name: /Record action/i }));
    await user.type(screen.getByLabelText(/Description/i), "Restarted service");
    await user.click(screen.getByRole("button", { name: /use current time/i }));
    await user.click(screen.getByRole("button", { name: /^Create action$/i }));
    expect(await screen.findByRole("status")).toBeInTheDocument();
    expect(screen.queryByRole("form", { name: "Create action" })).not.toBeInTheDocument();
    expect(mockedApi.listTicketActions).toHaveBeenCalledTimes(2);
  });

  it("renders replayed creates as the original success, once", async () => {
    const user = userEvent.setup();
    renderStaff();
    expect(await screen.findByRole("table")).toBeInTheDocument();
    mockedApi.createTicketAction.mockResolvedValue({ action: tableRows[1] as never, replayed: true });
    await user.click(screen.getByRole("button", { name: /Record action/i }));
    await user.type(screen.getByLabelText(/Description/i), "Restarted service");
    await user.click(screen.getByRole("button", { name: /use current time/i }));
    await user.click(screen.getByRole("button", { name: /^Create action$/i }));
    const status = await screen.findByRole("status");
    expect(status.textContent).toMatch(/already recorded|replay/i);
    expect(screen.getAllByRole("row")).toHaveLength(3);
  });

  it("hides every mutation control on terminal tickets but keeps the table", async () => {
    renderStaff("RESOLVED");
    expect(await screen.findByRole("table")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Record action/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Start$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Edit$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Complete$/i })).not.toBeInTheDocument();
    expect(screen.getByText(/read-only/i)).toBeInTheDocument();
  });

  it("starts a PLANNED action and refreshes versions from the server", async () => {
    const user = userEvent.setup();
    renderStaff();
    expect(await screen.findByRole("table")).toBeInTheDocument();
    mockedApi.updateTicketAction.mockResolvedValue({ ...tableRows[1], status: "IN_PROGRESS", version: 2 } as never);
    const refreshed = [{ ...tableRows[0] }, { ...tableRows[1], status: "IN_PROGRESS", version: 2 }];
    mockedApi.listTicketActions.mockResolvedValue({ actions: refreshed as never, meta: { count: 2 } });
    await user.click(screen.getByRole("button", { name: /^Start$/i }));
    expect(mockedApi.updateTicketAction).toHaveBeenCalledWith(9, expect.objectContaining({ expectedVersion: 1, status: "IN_PROGRESS" }));
    expect(await screen.findByText("2")).toBeInTheDocument();
  });

  it("completes with a stored result after confirmation and refreshes", async () => {
    const user = userEvent.setup();
    const withResult = { ...tableRows[1], status: "IN_PROGRESS", result: "Fixed." };
    renderStaff("IN_PROGRESS", [tableRows[0], withResult] as never);
    expect(await screen.findByRole("table")).toBeInTheDocument();
    confirmSpy();
    mockedApi.completeTicketAction.mockResolvedValue({ ...withResult, status: "COMPLETED", version: 2 } as never);
    await user.click(screen.getByRole("button", { name: /^Complete$/i }));
    expect(mockedApi.completeTicketAction).toHaveBeenCalledWith(9, expect.objectContaining({ expectedVersion: 1 }));
    expect(await screen.findByRole("status")).toBeInTheDocument();
  });

  it("refuses to complete without a result and calls nothing", async () => {
    const user = userEvent.setup();
    const noResult = { ...tableRows[1], status: "IN_PROGRESS", result: null };
    renderStaff("IN_PROGRESS", [tableRows[0], noResult] as never);
    expect(await screen.findByRole("table")).toBeInTheDocument();
    confirmSpy();
    await user.click(screen.getByRole("button", { name: /^Complete$/i }));
    expect(await screen.findByText(/result is required/i)).toBeInTheDocument();
    expect(mockedApi.completeTicketAction).not.toHaveBeenCalled();
  });

  it("maps conflict codes to actionable guidance and reloads", async () => {
    const user = userEvent.setup();
    const withResult = { ...tableRows[1], status: "IN_PROGRESS", result: "Fixed." };
    renderStaff("IN_PROGRESS", [tableRows[0], withResult] as never);
    expect(await screen.findByRole("table")).toBeInTheDocument();
    confirmSpy();
    mockedApi.completeTicketAction.mockRejectedValueOnce({ status: 409, body: { error: { code: "ACTION_STATE_CHANGED", message: "Stale." } } });
    await user.click(screen.getByRole("button", { name: /^Complete$/i }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/refresh/i);
    expect(mockedApi.listTicketActions.mock.calls.length).toBeGreaterThan(1);
  });

  it("explains terminal and ineligible conflicts distinctly", async () => {
    const user = userEvent.setup();
    const withResult = { ...tableRows[1], status: "IN_PROGRESS", result: "Fixed." };
    renderStaff("IN_PROGRESS", [tableRows[0], withResult] as never);
    expect(await screen.findByRole("table")).toBeInTheDocument();
    confirmSpy();
    mockedApi.completeTicketAction
      .mockRejectedValueOnce({ status: 409, body: { error: { code: "INVALID_ACTION_TRANSITION", message: "Frozen." } } })
      .mockRejectedValueOnce({ status: 409, body: { error: { code: "ACTION_ASSIGNEE_NOT_ELIGIBLE", message: "Ineligible." } } });
    await user.click(screen.getByRole("button", { name: /^Complete$/i }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/read-only/i);
    await user.click(screen.getByRole("button", { name: /^Complete$/i }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/eligible/i);
  });

  it("renders the idempotent-conflict no-retry notice without duplicating", async () => {
    const user = userEvent.setup();
    const withResult = { ...tableRows[1], status: "IN_PROGRESS", result: "Fixed." };
    renderStaff("IN_PROGRESS", [tableRows[0], withResult] as never);
    expect(await screen.findByRole("table")).toBeInTheDocument();
    confirmSpy();
    mockedApi.completeTicketAction.mockRejectedValueOnce({
      status: 409,
      body: { error: { code: "IDEMPOTENCY_CONFLICT", message: "Divergent." } },
    });
    await user.click(screen.getByRole("button", { name: /^Complete$/i }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/conflicting retry|no duplicate/i);
    expect(screen.getAllByRole("row")).toHaveLength(3);
  });

    it("loads per-action history through the staff endpoint", async () => {    const user = userEvent.setup();
    renderStaff();
    expect(await screen.findByRole("table")).toBeInTheDocument();
    mockedApi.listStaffActionEvents.mockResolvedValue({ events: events as never });
    await user.click(screen.getAllByRole("button", { name: /^History$/i })[0]);
    expect(mockedApi.listStaffActionEvents).toHaveBeenCalledWith(9);
    const region = await screen.findByLabelText("History for action 9");
    expect(within(region).getByText("CREATED")).toBeInTheDocument();
    expect(within(region).getByText((_content, el) => el?.tagName === "LI" && (el?.textContent ?? "").includes("Bob Staff"))).toBeInTheDocument();
  });

  it("edits from the tab with a prefilled form and reloads on save", async () => {
    const user = userEvent.setup();
    renderStaff();
    expect(await screen.findByRole("table")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^Edit$/i }));
    expect(screen.getByLabelText(/Description/i)).toHaveValue("Restarted service");
    expect(screen.getByText("Editing action #9 (version 1)")).toBeInTheDocument();
    mockedApi.updateTicketAction.mockResolvedValue({ ...tableRows[1], description: "Restarted twice", version: 2 } as never);
    await user.clear(screen.getByLabelText(/Description/i));
    await user.type(screen.getByLabelText(/Description/i), "Restarted twice");
    await user.click(screen.getByRole("button", { name: /^Save changes$/i }));
    expect(mockedApi.updateTicketAction).toHaveBeenCalledWith(9, expect.objectContaining({ expectedVersion: 1, description: "Restarted twice" }));
    expect(await screen.findByRole("status")).toBeInTheDocument();
    expect(mockedApi.listTicketActions.mock.calls.length).toBeGreaterThan(1);
  });
});

describe("ActionsTab requester mode (Issue #78, UI-03)", () => {
  it("shows the table and history with zero mutation controls", async () => {
    const user = userEvent.setup();
    mockedApi.listTicketActions.mockResolvedValue({ actions: tableRows as never, meta: { count: 2 } });
    render(<ActionsTab ticketId={7} ticketStatus="OPEN" mode="requester" owners={[]} />);
    expect(await screen.findByRole("table")).toBeInTheDocument();
    for (const name of [/Record action/i, /^Start$/i, /^Edit$/i, /^Complete$/i, /^Cancel$/i]) {
      expect(screen.queryByRole("button", { name })).not.toBeInTheDocument();
    }
    mockedApi.listRequesterActionEvents.mockResolvedValue({
      events: [{ id: 1, actionTakenId: 9, eventType: "CREATED", actor: { id: 17, name: "Bob Staff" }, occurredAt: "2026-10-01T08:00:00.000Z", payload: {}, requestId: "r1" }] as never,
    });
    await user.click(screen.getAllByRole("button", { name: /^History$/i })[1]);
    expect(mockedApi.listRequesterActionEvents).toHaveBeenCalledWith(7, 9);
    expect(await screen.findByText("CREATED")).toBeInTheDocument();
  });
});

describe("Detail page integration (Issue #78, UI-03)", () => {  const staffDetail = {
    id: 101,
    ticketNumber: "2609-0101",
    summary: "VPN down",
    description: "Cannot connect.",
    requestedPriority: "HIGH",
    itPriority: "HIGH",
    currentStatus: "NEW",
    ticketDate: "2026-09-12T08:00:00.000Z",
    requester: { id: 5, name: "Alice Example", email: "alice@example.com" },
    category: { id: 3, name: "Network" },
    relatedSystem: { id: 1, name: "Email" },
    ticketOwner: null,
    requesterResolutionIndicatedAt: null,
    updatedAt: "2026-09-12T12:00:00.000Z",
    attachments: [],
  };

  it("staff detail renders the Actions Taken section inside Ticket Actions", async () => {
    mockedApi.getStaffTicketDetail.mockResolvedValue(staffDetail as never);
    mockedApi.listEligibleOwners.mockResolvedValue({ data: owners });
    mockedApi.listTicketComments.mockResolvedValue({ data: [] });
    mockedApi.listTicketNotes.mockResolvedValue({ data: [] });
    mockedApi.listTicketActions.mockResolvedValue({ actions: tableRows as never, meta: { count: 2 } });
    render(
      <MemoryRouter initialEntries={["/staff/tickets/101"]}>
        <Routes>
          <Route path="/staff/tickets/:id" element={<StaffTicketDetail />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByRole("heading", { name: "Ticket 2609-0101" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Actions Taken" })).toBeInTheDocument();
    expect(await screen.findByRole("table")).toBeInTheDocument();
    // Original operations stay intact.
    expect(screen.getByRole("button", { name: "Claim Ticket" })).toBeInTheDocument();
  });

  it("requester detail renders actions read-only with zero mutation controls", async () => {
    mockedApi.listTicketComments.mockResolvedValue({ data: [] });
    mockedApi.getTicketDetail.mockResolvedValue({
      id: 101,
      ticketNumber: "2609-0101",
      summary: "VPN down",
      description: "Cannot connect.",
      requestedPriority: "HIGH",
      itPriority: "HIGH",
      currentStatus: "IN_PROGRESS",
      ticketDate: "2026-09-12T08:00:00.000Z",
      requester: { id: 5, name: "Alice Example", email: "alice@example.com" },
      category: { id: 3, name: "Network" },
      relatedSystem: { id: 1, name: "Email" },
      ticketOwner: null,
      indicated: false,
      resolutionOffered: false,
      updatedAt: "2026-09-12T12:00:00.000Z",
      attachments: [],
      comments: [],
    });
    mockedApi.listTicketActions.mockResolvedValue({ actions: tableRows as never, meta: { count: 2 } });
    render(
      <MemoryRouter initialEntries={["/tickets/101"]}>
        <Routes>
          <Route path="/tickets/:id" element={<TicketDetail />} />
        </Routes>
      </MemoryRouter>,
    );
    await userEvent.click(await screen.findByRole("tab", { name: "Ticket Actions" }));
    expect(await screen.findByRole("heading", { name: "Actions Taken" })).toBeInTheDocument();
    expect(await screen.findByRole("table")).toBeInTheDocument();
    for (const name of [/Record action/i, /^Start$/i, /^Edit$/i, /^Complete$/i, /^Cancel$/i]) {
      expect(screen.queryByRole("button", { name })).not.toBeInTheDocument();
    }
  });
});

describe("Terminal confirmations (Issue #78, UI-03, U9)", () => {  function renderStaffCancel() {
    const inProgress = { ...tableRows[1], status: "IN_PROGRESS" };
    mockedApi.listTicketActions.mockResolvedValue({ actions: [inProgress] as never, meta: { count: 1 } });
    render(<ActionsTab ticketId={7} ticketStatus="IN_PROGRESS" mode="staff" owners={owners} />);
  }

  it("cancels only after explicit confirmation and announces the outcome", async () => {
    const user = userEvent.setup();
    renderStaffCancel();
    expect(await screen.findByRole("table")).toBeInTheDocument();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    mockedApi.cancelTicketAction.mockResolvedValue({ ...tableRows[1], status: "CANCELLED", version: 2 } as never);
    await user.click(screen.getByRole("button", { name: /^Cancel$/i }));
    expect(confirm).toHaveBeenCalledWith(expect.stringMatching(/terminal/i));
    expect(mockedApi.cancelTicketAction).toHaveBeenCalledWith(9, expect.objectContaining({ expectedVersion: 1 }));
    expect(await screen.findByRole("status")).toBeInTheDocument();
  });

  it("aborts the cancel when confirmation is dismissed", async () => {
    const user = userEvent.setup();
    renderStaffCancel();
    expect(await screen.findByRole("table")).toBeInTheDocument();
    vi.spyOn(window, "confirm").mockReturnValue(false);
    await user.click(screen.getByRole("button", { name: /^Cancel$/i }));
    expect(mockedApi.cancelTicketAction).not.toHaveBeenCalled();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});

describe("Focus management (Issue #78, U9, ui-spec 8-9)", () => {
  it("focuses the description on form open and returns focus to Record on cancel", async () => {
    const user = userEvent.setup();
    mockedApi.listTicketActions.mockResolvedValue({ actions: tableRows as never, meta: { count: 2 } });
    render(<ActionsTab ticketId={7} ticketStatus="IN_PROGRESS" mode="staff" owners={owners} />);
    expect(await screen.findByRole("table")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Record action/i }));
    expect(screen.getByLabelText(/Description/i)).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.getByRole("button", { name: /Record action/i })).toHaveFocus();
    expect(screen.queryByRole("form", { name: "Create action" })).not.toBeInTheDocument();
  });

  it("returns focus to the invoking control after save and after history toggle", async () => {
    const user = userEvent.setup();
    mockedApi.listTicketActions.mockResolvedValue({ actions: tableRows as never, meta: { count: 2 } });
    mockedApi.createTicketAction.mockResolvedValue({ action: tableRows[1] as never, replayed: false });
    render(<ActionsTab ticketId={7} ticketStatus="IN_PROGRESS" mode="staff" owners={owners} />);
    expect(await screen.findByRole("table")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Record action/i }));
    await user.type(screen.getByLabelText(/Description/i), "Restarted service");
    await user.click(screen.getByRole("button", { name: /use current time/i }));
    await user.click(screen.getByRole("button", { name: /^Create action$/i }));
    expect(await screen.findByRole("status")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Record action/i })).toHaveFocus();
    mockedApi.listStaffActionEvents.mockResolvedValue({ events: [] as never });
    await user.click(screen.getAllByRole("button", { name: /^History$/i })[1]);
    expect(await screen.findByLabelText("History for action 11")).toHaveFocus();
  });
});

describe("Workflow gate UI (Issue #79, UI-04)", () => {
  const gateDetail = {
    id: 101,
    ticketNumber: "2609-0101",
    summary: "VPN down",
    description: "Cannot connect.",
    requestedPriority: "HIGH",
    itPriority: "HIGH",
    currentStatus: "IN_PROGRESS",
    ticketDate: "2026-09-12T08:00:00.000Z",
    requester: { id: 5, name: "Alice Example", email: "alice@example.com" },
    category: { id: 3, name: "Network" },
    relatedSystem: { id: 1, name: "Email" },
    ticketOwner: { id: 17, name: "Bob Staff", role: "IT_STAFF" },
    requesterResolutionIndicatedAt: null,
    resolutionCycle: 2,
    updatedAt: "2026-09-12T12:00:00.000Z",
    attachments: [],
  };

  function renderStaffGate() {
    mockedApi.getStaffTicketDetail.mockResolvedValue(gateDetail as never);
    mockedApi.listEligibleOwners.mockResolvedValue({ data: owners });
    mockedApi.listTicketComments.mockResolvedValue({ data: [] });
    mockedApi.listTicketNotes.mockResolvedValue({ data: [] });
    mockedApi.listTicketActions.mockResolvedValue({ actions: [], meta: { count: 0 } });
    render(
      <MemoryRouter initialEntries={["/staff/tickets/101"]}>
        <Routes>
          <Route path="/staff/tickets/:id" element={<StaffTicketDetail />} />
        </Routes>
      </MemoryRouter>,
    );
  }

  it("shows the current cycle chip in the Actions Taken section", async () => {
    renderStaffGate();
    expect(await screen.findByRole("heading", { name: "Ticket 2609-0101" })).toBeInTheDocument();
    expect(await screen.findByText("Cycle 2")).toBeInTheDocument();
  });

  it("maps gate-blocked resolve to copy plus an Actions-activating link", async () => {
    const user = userEvent.setup();
    renderStaffGate();
    expect(await screen.findByRole("heading", { name: "Ticket 2609-0101" })).toBeInTheDocument();
    mockedApi.setStaffTicketStatus.mockRejectedValueOnce({
      status: 409,
      body: { error: { code: "RESOLUTION_REQUIRES_COMPLETED_ACTION", currentCycle: 2, message: "No completed work." } },
    });
    const statusSelect = screen.getByLabelText("Current Status");
    await user.selectOptions(statusSelect, "RESOLVED");
    expect(statusSelect).toHaveValue("RESOLVED");
    const updateButton = screen.getByRole("button", { name: /^Update Status$/i });
    expect(updateButton).toBeEnabled();
    await user.click(updateButton);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/no completed work/i);
    await user.click(screen.getByRole("button", { name: /Go to Actions/i }));
    expect(screen.getByRole("tab", { name: "Ticket Actions" })).toHaveAttribute("aria-selected", "true");
  });

  it("maps open-action blocks to copy naming the count", async () => {
    const user = userEvent.setup();
    renderStaffGate();
    expect(await screen.findByRole("heading", { name: "Ticket 2609-0101" })).toBeInTheDocument();
    mockedApi.setStaffTicketStatus.mockRejectedValueOnce({
      status: 409,
      body: { error: { code: "RESOLUTION_BLOCKED_BY_OPEN_ACTIONS", openActionIds: [9], message: "Still open." } },
    });
    const statusSelect = screen.getByLabelText("Current Status");
    await user.selectOptions(statusSelect, "RESOLVED");
    expect(statusSelect).toHaveValue("RESOLVED");
    const updateButton = screen.getByRole("button", { name: /^Update Status$/i });
    expect(updateButton).toBeEnabled();
    await user.click(updateButton);
    expect((await screen.findByRole("alert")).textContent).toMatch(/open action/i);
  });
});
