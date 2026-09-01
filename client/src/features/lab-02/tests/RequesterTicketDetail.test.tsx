import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import TicketDetail from "../../../pages/TicketDetail";
import * as api from "../../../api.js";
import { RequesterProvider } from "../../../contexts/RequesterContext.js";
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
      <RequesterProvider>
        <Routes>
          <Route path="/tickets/:id" element={<TicketDetail />} />
        </Routes>
      </RequesterProvider>
    </MemoryRouter>
  );
}

const mockRequester = { id: 1, name: "Test User", email: "test@test.com" };

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
  localStorage.setItem("toktickit.requester", JSON.stringify(mockRequester));
});

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("RequesterTicketDetail", () => {
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

    // Ticket Date field with Bangkok formatting
    const expectedDate = formatBangkok(baseTicket.ticketDate);
    expect(screen.getByLabelText("Ticket Date")).toBeInTheDocument();
    expect(screen.getByDisplayValue(expectedDate)).toBeInTheDocument();

    // attachments rendered
    expect(screen.getByText("report.pdf")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Download" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove" })).toBeInTheDocument();
  });
});
