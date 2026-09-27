import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import TicketDetail from "../../../pages/TicketDetail";
import * as api from "../../../api.js";
import { formatBangkok } from "../../../components/AttachmentSection";

vi.mock("../../../api.js");

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function renderDetail(initialPath = "/tickets/1") {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/tickets/:id" element={<TicketDetail />} />
        <Route path="/my-tickets" element={<div>My Tickets destination</div>} />
      </Routes>
    </MemoryRouter>
  );
}

const baseTicket = {
  id: 1,
  ticketNumber: "2608-0001",
  ticketDate: "2026-08-20T10:00:00.000Z",
  summary: "Laptop issue",
  description: "Battery drains quickly and screen flickers",
  requestedPriority: "HIGH",
  currentStatus: "NEW",
  category: { id: 1, name: "Hardware" },
  relatedSystem: { id: 1, name: "Email" },
  requester: { id: 1, name: "Test User", email: "test@test.com" },
  attachments: [] as any[],
  createdAt: "2026-08-20T10:00:00.000Z",
  updatedAt: "2026-08-20T10:00:00.000Z",
};

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  // Issue #49: detail loads the comment timeline alongside the ticket;
  // default to an empty timeline unless a test overrides it.
  vi.spyOn(api, "listTicketComments").mockResolvedValue({ data: [] });
});

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("RequesterTicketDetail", () => {
  it("UI-26 shows top-right Back to My Tickets and navigation does not mutate Ticket or Attachments", async () => {
    vi.spyOn(api, "getTicketDetail").mockResolvedValue(baseTicket);
    const uploadSpy = vi.spyOn(api, "uploadAttachment");
    const downloadSpy = vi.spyOn(api, "downloadAttachment");
    const removeSpy = vi.spyOn(api, "removeAttachment");

    renderDetail();
    await waitFor(() => expect(screen.getByText(`Ticket ${baseTicket.ticketNumber}`)).toBeInTheDocument());

    const heading = screen.getByRole("heading", { name: `Ticket ${baseTicket.ticketNumber}` });
    const back = screen.getByRole("link", { name: "Back to My Tickets" });
    expect(back).toHaveAttribute("href", "/my-tickets");
    const headingRow = back.closest(".lab2-screen-heading");
    expect(headingRow).toContainElement(heading);
    expect(headingRow).toHaveClass("justify-content-between", "align-items-center", "lab2-mobile-stack");

    await userEvent.click(back);
    expect(await screen.findByText("My Tickets destination")).toBeInTheDocument();
    expect(uploadSpy).not.toHaveBeenCalled();
    expect(downloadSpy).not.toHaveBeenCalled();
    expect(removeSpy).not.toHaveBeenCalled();
  });

  it("shows loading skeleton while fetching", async () => {
    const d = deferred<any>();
    vi.spyOn(api, "getTicketDetail").mockReturnValue(d.promise);

    renderDetail();

    expect(screen.getByText("Loading ticket…")).toBeInTheDocument();
    // prevent hanging
    d.resolve(baseTicket);
    await waitFor(() => expect(screen.queryByText("Loading ticket…")).not.toBeInTheDocument());
  });

  it('shows 404 "Ticket not found" with Back link', async () => {
    vi.spyOn(api, "getTicketDetail").mockRejectedValue({ status: 404, body: { error: { code: "NOT_FOUND" } } });

    renderDetail();

    await waitFor(() => expect(screen.getByText("Ticket not found")).toBeInTheDocument());
    const back = screen.getByRole("link", { name: "Back to My Tickets" });
    expect(back).toBeInTheDocument();
    expect(back.getAttribute("href")).toBe("/my-tickets");
  });

  it("shows failure banner with Retry and retries on click", async () => {
    const spy = vi
      .spyOn(api, "getTicketDetail")
      .mockRejectedValueOnce(new Error("Unable to connect to TokTickIT API"))
      .mockResolvedValueOnce(baseTicket);

    renderDetail();

    await waitFor(() => expect(screen.getByText("Unable to connect to TokTickIT API")).toBeInTheDocument());
    const retry = screen.getByRole("button", { name: "Retry" });
    expect(retry).toBeInTheDocument();

    await userEvent.click(retry);

    await waitFor(() => expect(spy).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByText(`Ticket ${baseTicket.ticketNumber}`)).toBeInTheDocument());
  });

  it("removed attachment row is struck-through and has no Download", async () => {
    const removedAttachment = {
      id: 10,
      originalFilename: "old.pdf",
      mimeType: "application/pdf",
      sizeBytes: 1024,
      removedAt: "2026-08-21T10:00:00.000Z",
      removedReason: "wrong file",
      createdAt: "2026-08-20T09:00:00.000Z",
    };
    const activeAttachment = {
      id: 11,
      originalFilename: "active.png",
      mimeType: "image/png",
      sizeBytes: 2048,
      removedAt: null,
      removedReason: null,
      createdAt: "2026-08-20T09:00:00.000Z",
    };
    vi.spyOn(api, "getTicketDetail").mockResolvedValue({
      ...baseTicket,
      attachments: [removedAttachment, activeAttachment],
    });

    renderDetail();

    await waitFor(() => expect(screen.getByText(`Ticket ${baseTicket.ticketNumber}`)).toBeInTheDocument());

    // Issue #49: attachments live under the Attachments tab.
    await userEvent.click(screen.getByRole("tab", { name: "Attachments" }));

    // removed file name should be rendered
    const removedSpan = screen.getByText("old.pdf");
    expect(removedSpan).toBeInTheDocument();
    expect(removedSpan).toHaveStyle({ textDecoration: "line-through" });

    // removed row should not have Download button
    // There is one Download for active, but none for removed. Count Downloads
    const downloads = screen.getAllByRole("button", { name: "Download" });
    expect(downloads).toHaveLength(1);
    expect(screen.getByText("active.png")).toBeInTheDocument();
    // removed reason displayed
    expect(screen.getByText(/wrong file/)).toBeInTheDocument();
  });

  it("success shows Ticket Number, Ticket Date and attachments", async () => {
    const att = {
      id: 20,
      originalFilename: "report.pdf",
      mimeType: "application/pdf",
      sizeBytes: 5120,
      removedAt: null,
      removedReason: null,
      createdAt: "2026-08-20T09:00:00.000Z",
    };
    vi.spyOn(api, "getTicketDetail").mockResolvedValue({
      ...baseTicket,
      attachments: [att],
    });

    renderDetail();

    await waitFor(() => expect(screen.getByText(`Ticket ${baseTicket.ticketNumber}`)).toBeInTheDocument());

    // Ticket Number field
    expect(screen.getByText("Ticket Number")).toBeInTheDocument();
    expect(screen.getByDisplayValue(baseTicket.ticketNumber)).toBeInTheDocument();

    // Ticket Date field with Bangkok formatting (Last Updated shares the
    // fixture timestamp, so assert each field through its own label).
    const expectedDate = formatBangkok(baseTicket.ticketDate);
    expect(screen.getByLabelText("Ticket Date")).toHaveValue(expectedDate);
    expect(screen.getByLabelText("Last Updated")).toHaveValue(expectedDate);

    // Issue #49: attachments live under the Attachments tab.
    await userEvent.click(screen.getByRole("tab", { name: "Attachments" }));

    // attachments rendered
    expect(screen.getByText("report.pdf")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Download" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove" })).toBeInTheDocument();
  });
});

describe("RequesterTicketDetail communication additions (Lab 3 Issue #49, UI-06)", () => {
  const ownedTicket = {
    ...baseTicket,
    itPriority: "HIGH",
    ticketOwner: { id: 17, name: "Bob Staff" },
    requesterResolutionIndicatedAt: null,
  };

  const comments = [
    {
      id: 81,
      author: { id: 1, name: "Test User", role: "REQUESTER" },
      content: "Still broken after restart.",
      createdAt: "2026-09-12T12:30:00.000Z",
    },
    {
      id: 82,
      author: { id: 17, name: "Bob Staff", role: "IT_STAFF" },
      content: "Looking into the logs now.",
      createdAt: "2026-09-12T12:45:00.000Z",
    },
  ];

  beforeEach(() => {
    vi.spyOn(api, "getTicketDetail").mockResolvedValue(ownedTicket);
    vi.spyOn(api, "listTicketComments").mockResolvedValue({ data: comments });
  });

  it("shows Assigned To alongside retained requester fields and no Internal Notes surface", async () => {
    renderDetail();
    await waitFor(() => expect(screen.getByText(`Ticket ${baseTicket.ticketNumber}`)).toBeInTheDocument());

    // Breadcrumb row below navigation per the approved mockup.
    const breadcrumb = screen.getByRole("navigation", { name: "Breadcrumb" });
    expect(within(breadcrumb).getByRole("link", { name: "My Tickets" })).toHaveAttribute("href", "/my-tickets");

    expect(screen.getByLabelText("Assigned To")).toHaveValue("Bob Staff");
    expect(screen.getByText("Req. Priority")).toBeInTheDocument();
    expect(screen.getByText("Status")).toBeInTheDocument();
    expect(screen.getByLabelText("Last Updated")).toBeInTheDocument();
    expect(screen.getByDisplayValue(baseTicket.ticketNumber)).toBeInTheDocument();
    expect(screen.queryByText(/internal note/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Internal Notes" })).not.toBeInTheDocument();
  });

  it("Unassigned tickets show Unassigned instead of an owner name", async () => {
    vi.spyOn(api, "getTicketDetail").mockResolvedValue({ ...ownedTicket, ticketOwner: null });
    renderDetail();
    await waitFor(() => expect(screen.getByText(`Ticket ${baseTicket.ticketNumber}`)).toBeInTheDocument());
    expect(screen.getByLabelText("Assigned To")).toHaveValue("Unassigned");
  });

  it("Public Comments tab shows the timeline, compact composer, and posts within 200 chars", async () => {
    const user = userEvent.setup();
    const postSpy = vi.spyOn(api, "postTicketComment").mockImplementation(async (_id, content) => ({
      id: 83,
      author: { id: 1, name: "Test User", role: "REQUESTER" },
      content,
      createdAt: "2026-09-12T13:00:00.000Z",
    }));
    renderDetail();
    await waitFor(() => expect(screen.getByText(`Ticket ${baseTicket.ticketNumber}`)).toBeInTheDocument());

    await user.click(screen.getByRole("tab", { name: "Public Comments" }));
    expect(screen.getByText("Still broken after restart.")).toBeInTheDocument();
    expect(screen.getByText("Looking into the logs now.")).toBeInTheDocument();
    // Underline tabs per the requester mockup: active tab carries the
    // active class and selected state.
    const activeTab = screen.getByRole("tab", { name: "Public Comments" });
    expect(activeTab).toHaveClass("lab3-rd-tab", "active");
    expect(activeTab).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Attachments" })).not.toHaveClass("active");

    const composer = screen.getByPlaceholderText("Add a public comment…");
    await user.type(composer, "Any update from IT?");
    expect(screen.getByText("19 / 200")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Post Comment" }));
    expect(postSpy).toHaveBeenCalledWith(1, "Any update from IT?");
    expect(await screen.findByText("Any update from IT?")).toBeInTheDocument();
  });

  it("Ticket Actions offers Problem Appears Resolved only in allowed statuses", async () => {
    const user = userEvent.setup();
    const resolveSpy = vi.spyOn(api, "markProblemResolved").mockResolvedValue({
      requesterResolutionIndicatedAt: "2026-09-12T12:40:00.000Z",
    });
    // After resolving, the reloaded ticket carries the indication.
    vi.spyOn(api, "getTicketDetail")
      .mockResolvedValueOnce(ownedTicket)
      .mockResolvedValue({ ...ownedTicket, requesterResolutionIndicatedAt: "2026-09-12T12:40:00.000Z" });
    renderDetail();
    await waitFor(() => expect(screen.getByText(`Ticket ${baseTicket.ticketNumber}`)).toBeInTheDocument());

    await user.click(screen.getByRole("tab", { name: "Ticket Actions" }));
    await user.click(screen.getByRole("button", { name: "Problem Appears Resolved" }));
    expect(resolveSpy).toHaveBeenCalledWith(1);
    expect(await screen.findByText("You indicated that the problem appears resolved.")).toBeInTheDocument();
  });

  it("Ticket Actions hides the action in RESOLVED and explains formal status stays", async () => {
    const user = userEvent.setup();
    vi.spyOn(api, "getTicketDetail").mockResolvedValue({ ...ownedTicket, currentStatus: "RESOLVED" });
    renderDetail();
    await waitFor(() => expect(screen.getByText(`Ticket ${baseTicket.ticketNumber}`)).toBeInTheDocument());

    await user.click(screen.getByRole("tab", { name: "Ticket Actions" }));
    expect(screen.queryByRole("button", { name: "Problem Appears Resolved" })).not.toBeInTheDocument();
  });
});
