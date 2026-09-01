import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BrowserRouter } from "react-router-dom";
import AppShell from "../../../components/AppShell";
import AttachmentSection, { Attachment } from "../../../components/AttachmentSection";
import CreateTicket from "../../../pages/CreateTicket";
import MyTickets from "../../../pages/MyTickets";
import { RequesterProvider } from "../../../contexts/RequesterContext";
import * as api from "../../../api.js";

vi.mock("../../../api.js");

const requester = { id: 41, name: "Style Test Requester", email: "style@test.local" };

function withRequester(ui: React.ReactNode) {
  localStorage.setItem("toktickit.requester", JSON.stringify(requester));
  return render(
    <BrowserRouter>
      <RequesterProvider>{ui}</RequesterProvider>
    </BrowserRouter>
  );
}

function mockReferenceData() {
  vi.mocked(api.fetchCategories).mockResolvedValue([{ id: 11, name: "Hardware" }]);
  vi.mocked(api.fetchRelatedSystems).mockResolvedValue([{ id: 21, name: "Email" }]);
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe("Lab 2 UI style contract", () => {
  it("STYLE-01: shell header and primary Create action use Zen Green token classes", async () => {
    withRequester(<AppShell><p>content</p></AppShell>);
    expect(screen.getByRole("banner")).toHaveClass("zen-header");

    mockReferenceData();
    withRequester(<CreateTicket />);
    await waitFor(() => expect(screen.getByLabelText(/Category/)).toBeEnabled());
    expect(screen.getByRole("button", { name: "Submit Ticket" })).toHaveClass("btn-zen-primary");
  });

  it("STYLE-02/03: selected-state and priority/status badge classes map to documented tokens", async () => {
    withRequester(<AppShell><p>content</p></AppShell>);
    expect(screen.getByText(requester.name).closest(".zen-selected")).not.toBeNull();

    vi.mocked(api.fetchCategories).mockResolvedValue([{ id: 11, name: "Hardware" }]);
    vi.mocked(api.listTickets).mockResolvedValue({
      data: [{
        id: 1,
        ticketNumber: "2609-0001",
        summary: "Critical hardware issue",
        description: "A sufficiently long ticket description for style testing.",
        category: { id: 11, name: "Hardware" },
        relatedSystem: { id: 21, name: "Email" },
        requestedPriority: "CRITICAL",
        currentStatus: "NEW",
        updatedAt: "2026-09-01T10:00:00.000Z",
      }],
      meta: { page: 1, pageSize: 10, totalCount: 1, totalPages: 1, hasNextPage: false, hasPreviousPage: false },
    });

    withRequester(<MyTickets />);
    const priority = await screen.findAllByText("CRITICAL", { selector: ".badge" });
    const status = await screen.findAllByText("NEW", { selector: ".badge" });
    expect(priority[0]).toHaveClass("badge-priority-critical");
    expect(status[0]).toHaveClass("badge-status-new");
  });

  it("STYLE-04/05: required markers and read-only fields are explicitly distinguishable", async () => {
    mockReferenceData();
    withRequester(<CreateTicket />);
    await waitFor(() => expect(api.fetchCategories).toHaveBeenCalled());

    expect(screen.getAllByText("*", { selector: ".required-marker" }).length).toBeGreaterThanOrEqual(5);
    const ticketNumber = screen.getByDisplayValue("Generated after submission");
    expect(ticketNumber).toHaveAttribute("readonly");
    expect(ticketNumber).toHaveClass("form-readonly");
  });

  it("UI-19: global focus-visible rule and mobile nav button expose keyboard/accessibility semantics", async () => {
    withRequester(<AppShell><p>content</p></AppShell>);
    const menu = screen.getByRole("button", { name: "Toggle navigation" });
    expect(menu).toHaveAttribute("aria-expanded", "false");
    expect(menu).toHaveAttribute("aria-controls", "lab2-navigation");
    menu.focus();
    expect(menu).toHaveFocus();

    await userEvent.click(menu);
    expect(menu).toHaveAttribute("aria-expanded", "true");
  });

  it("UI-19: Create Ticket moves focus to the first invalid field", async () => {
    mockReferenceData();
    withRequester(<CreateTicket />);
    await waitFor(() => expect(screen.getByLabelText(/Category/)).toBeEnabled());

    await userEvent.click(screen.getByRole("button", { name: "Submit Ticket" }));

    expect(screen.getByLabelText(/Category/)).toHaveFocus();
  });

  it("UI-19: attachment removal modal is labelled, traps semantics, closes on Escape, and returns focus", async () => {
    const attachment: Attachment = {
      id: 1,
      originalFilename: "evidence.pdf",
      mimeType: "application/pdf",
      sizeBytes: 1024,
      removedAt: null,
      removedReason: null,
      createdAt: "2026-09-01T10:00:00.000Z",
    };
    render(
      <AttachmentSection
        attachments={[attachment]}
        onDownload={vi.fn()}
        onRemove={vi.fn()}
        onUpload={vi.fn()}
        canUpload
      />
    );

    const remove = screen.getByRole("button", { name: "Remove" });
    remove.focus();
    await userEvent.click(remove);
    const dialog = screen.getByRole("dialog", { name: "Remove Attachment" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(screen.getByLabelText("Reason")).toHaveFocus();
    expect(screen.getByLabelText("Reason")).toHaveAttribute("aria-required", "true");

    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(remove).toHaveFocus();
  });

  it("UI-20: responsive proxy classes are applied to navigation and Create actions", async () => {
    withRequester(<AppShell><p>content</p></AppShell>);
    expect(screen.getByRole("button", { name: "Toggle navigation" })).toHaveClass("lab2-nav-toggle");
    expect(document.getElementById("lab2-navigation")).toHaveClass("lab2-nav-links");

    mockReferenceData();
    withRequester(<CreateTicket />);
    await waitFor(() => expect(screen.getByLabelText(/Category/)).toBeEnabled());
    expect(screen.getByRole("button", { name: "Submit Ticket" }).parentElement).toHaveClass("lab2-mobile-stack");
  });
});
