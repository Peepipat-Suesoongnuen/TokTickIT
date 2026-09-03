import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BrowserRouter } from "react-router-dom";
import MyTickets, { formatBangkok } from "../../../pages/MyTickets";
import * as api from "../../../api.js";
import { RequesterProvider } from "../../../contexts/RequesterContext.js";

vi.mock("../../../api.js");

function renderWithProviders() {
  return render(
    <BrowserRouter>
      <RequesterProvider>
        <MyTickets />
      </RequesterProvider>
    </BrowserRouter>
  );
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  window.history.pushState({}, "", "/my-tickets");
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("MyTickets", () => {
  const mockRequester = { id: 1, name: "Test User", email: "test@test.com" };
  const mockCategories = [{ id: 1, name: "Hardware" }, { id: 2, name: "Software" }];
  const mockSystems = [{ id: 1, name: "Email" }, { id: 2, name: "VPN" }];
  const mockTickets = [
    {
      id: 1,
      ticketNumber: "2608-0001",
      summary: "Laptop battery drains",
      description: "Battery drains quickly",
      category: { id: 1, name: "Hardware" },
      relatedSystem: { id: 1, name: "Email" },
      requestedPriority: "LOW",
      currentStatus: "NEW",
      ticketDate: "2026-08-20T09:00:00.000Z",
      updatedAt: "2026-08-20T10:00:00.000Z",
    },
    {
      id: 2,
      ticketNumber: "2608-0002",
      summary: "VPN not connecting",
      description: "VPN fails to connect",
      category: { id: 1, name: "Hardware" },
      relatedSystem: { id: 2, name: "VPN" },
      requestedPriority: "CRITICAL",
      currentStatus: "NEW",
      ticketDate: "2026-08-21T09:00:00.000Z",
      updatedAt: "2026-08-21T10:00:00.000Z",
    },
  ];

  beforeEach(() => {
    localStorage.setItem("toktickit.requester", JSON.stringify({ id: 1, name: "Test User", email: "test@test.com" }));
  });

  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  describe("Empty and No-Results States (UI-07)", () => {
    it("shows empty state when no tickets exist", async () => {
      vi.spyOn(api, "fetchCategories").mockResolvedValue([]);
      vi.spyOn(api, "listTickets").mockResolvedValue({
        data: [],
        meta: { page: 1, pageSize: 10, totalCount: 0, totalPages: 0, hasNextPage: false, hasPreviousPage: false },
      });

      renderWithProviders();

      await waitFor(() => expect(screen.getByText("You have not created any tickets yet")).toBeInTheDocument());
      const createLinks = screen.getAllByRole("link", { name: "Create Ticket" });
      expect(createLinks.length).toBeGreaterThanOrEqual(1);
    });

    it("shows no-results state when filters exclude all tickets", async () => {
      vi.spyOn(api, "fetchCategories").mockResolvedValue([{ id: 1, name: "Hardware" }]);
      vi.spyOn(api, "listTickets").mockResolvedValue({
        data: [],
        meta: { page: 1, pageSize: 10, totalCount: 5, totalPages: 1, hasNextPage: false, hasPreviousPage: false },
      });

      renderWithProviders();

      // Wait for categories to load
      await waitFor(() => {
        const categorySelect = screen.getByRole("combobox", { name: /category/i });
        expect(categorySelect).toBeInTheDocument();
      });

      // Apply a filter to trigger isFiltered = true
      const categorySelect = screen.getByRole("combobox", { name: /category/i });
      await userEvent.selectOptions(categorySelect, "1");

      await waitFor(() => expect(screen.getByText("No tickets match your search or filters")).toBeInTheDocument());
      // There are two Clear Filters buttons (toolbar and no-results), check the first one
      const clearButtons = screen.getAllByRole("button", { name: "Clear Filters" });
      expect(clearButtons.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("Search and Filters (UI-08)", () => {
    it("sends correct search query to API", async () => {
      const listSpy = vi.spyOn(api, "listTickets").mockResolvedValue({
        data: [],
        meta: { page: 1, pageSize: 10, totalCount: 0, totalPages: 0, hasNextPage: false, hasPreviousPage: false },
      });
      vi.spyOn(api, "fetchCategories").mockResolvedValue([]);

      renderWithProviders();

      const searchInput = screen.getByPlaceholderText("Search ticket number or summary…");
      await userEvent.type(searchInput, "laptop");

      await waitFor(() => {
        expect(listSpy).toHaveBeenCalledWith(
          expect.objectContaining({ search: "laptop" })
        );
      });
    });

    it("sends category filter to API", async () => {
      vi.spyOn(api, "fetchCategories").mockResolvedValue([{ id: 1, name: "Hardware" }]);
      const listSpy = vi.spyOn(api, "listTickets").mockResolvedValue({
        data: [],
        meta: { page: 1, pageSize: 10, totalCount: 0, totalPages: 0, hasNextPage: false, hasPreviousPage: false },
      });

      renderWithProviders();

      // Wait for categories to load
      await waitFor(() => {
        const categorySelect = screen.getByRole("combobox", { name: /category/i });
        expect(categorySelect).toBeInTheDocument();
      });

      const categorySelect = screen.getByRole("combobox", { name: /category/i });
      await userEvent.selectOptions(categorySelect, "1");

      await waitFor(() => {
        expect(listSpy).toHaveBeenCalledWith(expect.objectContaining({ categoryId: 1 }));
      });
    });

    it("sends Current Status filter to API", async () => {
      vi.spyOn(api, "fetchCategories").mockResolvedValue([]);
      const listSpy = vi.spyOn(api, "listTickets").mockResolvedValue({
        data: [],
        meta: { page: 1, pageSize: 10, totalCount: 0, totalPages: 0, hasNextPage: false, hasPreviousPage: false },
      });

      renderWithProviders();
      const statusSelect = screen.getByRole("combobox", { name: "Current Status" });
      await userEvent.selectOptions(statusSelect, "NEW");

      await waitFor(() => {
        expect(listSpy).toHaveBeenLastCalledWith(expect.objectContaining({ currentStatus: "NEW" }));
      });
    });

    it("keeps top Clear Filters beside Create Ticket and resets filters/sort without changing page size (UI-25)", async () => {
      vi.spyOn(api, "fetchCategories").mockResolvedValue([{ id: 1, name: "Hardware" }]);
      vi.spyOn(api, "listTickets").mockResolvedValue({
        data: mockTickets,
        meta: { page: 1, pageSize: 10, totalCount: 2, totalPages: 1, hasNextPage: false, hasPreviousPage: false },
      });

      renderWithProviders();

      const searchInput = screen.getByPlaceholderText("Search ticket number or summary…");
      const clear = screen.getByRole("button", { name: "Clear Filters" });
      const create = screen.getByRole("link", { name: "Create Ticket" });
      expect(clear.parentElement).toBe(create.parentElement);
      expect(clear).toBeDisabled();

      const pageSize = screen.getByRole("combobox", { name: /rows per page/i });
      await userEvent.selectOptions(pageSize, "20");
      expect(clear).toBeDisabled();

      await userEvent.type(searchInput, "test");

      const categorySelect = screen.getByRole("combobox", { name: /category/i });
      await userEvent.selectOptions(categorySelect, "1");
      const statusSelect = screen.getByRole("combobox", { name: "Current Status" });
      await userEvent.selectOptions(statusSelect, "NEW");
      await userEvent.click(screen.getByRole("button", { name: /Sort by Ticket Number/i }));
      expect(clear).toBeEnabled();
      await userEvent.click(clear);

      expect(screen.getByPlaceholderText("Search ticket number or summary…")).toHaveValue("");
      expect(categorySelect).toHaveValue("");
      expect(statusSelect).toHaveValue("");
      expect(pageSize).toHaveValue("20");
      expect(screen.getByRole("columnheader", { name: /Last Updated/i })).toHaveAttribute("aria-sort", "descending");
    });
  });

  describe("Loading and States (UI-23)", () => {
    it("shows loading state while fetching", async () => {
      vi.spyOn(api, "listTickets").mockImplementation(() => new Promise(() => {}));
      vi.spyOn(api, "fetchCategories").mockResolvedValue([]);

      renderWithProviders();

      expect(screen.getByText("Loading tickets…")).toBeInTheDocument();
      await waitFor(() => expect(screen.getByRole("combobox", { name: /category/i })).not.toBeDisabled());
    });

    it("shows error state on API failure", async () => {
      vi.spyOn(api, "fetchCategories").mockResolvedValue([]);
      vi.spyOn(api, "listTickets").mockRejectedValue(new Error("Network error"));

      renderWithProviders();

      await waitFor(() => expect(screen.getByText("Unable to connect to TokTickIT API")).toBeInTheDocument());
    });
  });

  describe("Search Debounce", () => {
    it("debounces search input by 300ms", async () => {
      vi.spyOn(api, "fetchCategories").mockResolvedValue([]);
      const listSpy = vi.spyOn(api, "listTickets").mockResolvedValue({
        data: [],
        meta: { page: 1, pageSize: 10, totalCount: 0, totalPages: 0, hasNextPage: false, hasPreviousPage: false },
      });

      renderWithProviders();

      // Wait for initial load to complete
      await waitFor(() => expect(listSpy).toHaveBeenCalledTimes(1));

      const searchInput = screen.getByPlaceholderText("Search ticket number or summary…");
      await userEvent.type(searchInput, "lap");

      // Should not call API immediately (debounce)
      expect(listSpy).toHaveBeenCalledTimes(1);

      // Wait for debounce (300ms + buffer)
      await waitFor(() => {
        expect(listSpy).toHaveBeenCalledTimes(2);
        expect(listSpy).toHaveBeenLastCalledWith(expect.objectContaining({ search: "lap" }));
      }, { timeout: 2000 });
    }, 10000);

    it("does not restore a stale debounced search after Clear Filters", async () => {
      vi.spyOn(api, "fetchCategories").mockResolvedValue([]);
      const listSpy = vi.spyOn(api, "listTickets").mockResolvedValue({
        data: [],
        meta: { page: 1, pageSize: 10, totalCount: 0, totalPages: 0, hasNextPage: false, hasPreviousPage: false },
      });

      renderWithProviders();
      await waitFor(() => expect(listSpy).toHaveBeenCalledTimes(1));

      const searchInput = screen.getByPlaceholderText("Search ticket number or summary…");
      await userEvent.type(searchInput, "stale-term");
      await userEvent.click(screen.getByRole("button", { name: "Clear Filters" }));
      expect(searchInput).toHaveValue("");

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 450));
      });

      expect(listSpy).not.toHaveBeenCalledWith(expect.objectContaining({ search: "stale-term" }));
    }, 10000);
  });

  describe("Priority Badge Rendering", () => {
    it("renders priority badges with correct colors", async () => {
      vi.spyOn(api, "fetchCategories").mockResolvedValue([]);
      vi.spyOn(api, "listTickets").mockResolvedValue({
        data: [
          { id: 1, ticketNumber: "2608-0001", summary: "Test", category: { name: "Hardware" }, requestedPriority: "LOW", currentStatus: "NEW", updatedAt: "2026-08-20T10:00:00.000Z" },
          { id: 2, ticketNumber: "2608-0002", summary: "Test", category: { name: "Hardware" }, requestedPriority: "CRITICAL", currentStatus: "NEW", updatedAt: "2026-08-21T10:00:00.000Z" },
        ],
        meta: { page: 1, pageSize: 10, totalCount: 2, totalPages: 1, hasNextPage: false, hasPreviousPage: false },
      });

      renderWithProviders();

      // Wait for tickets to render - check for badges specifically (not select options)
      await waitFor(() => expect(screen.getByText("LOW")).toBeInTheDocument(), { timeout: 5000 });
      // Use getAllByText to find all CRITICAL elements and check the badge (not the select option)
      await waitFor(() => {
        const criticalElements = screen.getAllByText("CRITICAL");
        // Should have at least 2: one in priority select, two in badges (table + card)
        expect(criticalElements.length).toBeGreaterThanOrEqual(2);
      }, { timeout: 5000 });
    }, 10000);
  });

  describe("Pagination and Accessibility (UI fix evidence)", () => {
    it("renders numbered pagination, visible toolbar labels, stable columns, and Created time (UI-27)", async () => {
      vi.spyOn(api, "fetchCategories").mockResolvedValue([]);
      vi.spyOn(api, "listTickets").mockResolvedValue({
        data: [
          { id: 1, ticketNumber: "2608-0001", summary: "Test", category: { name: "Hardware" }, requestedPriority: "LOW", currentStatus: "NEW", ticketDate: "2026-08-20T09:00:00.000Z", updatedAt: "2026-08-20T10:00:00.000Z" },
        ],
        meta: { page: 1, pageSize: 10, totalCount: 25, totalPages: 3, hasNextPage: true, hasPreviousPage: false },
      });

      renderWithProviders();

      await waitFor(() => expect(screen.getAllByText("2608-0001").length).toBeGreaterThan(0));
      expect(screen.getByPlaceholderText("Search ticket number or summary…")).toBeInTheDocument();
      expect(screen.getByLabelText("Search")).toBeInTheDocument();
      expect(screen.getByLabelText("Category")).toBeInTheDocument();
      expect(screen.getByLabelText("Requested Priority")).toBeInTheDocument();
      expect(screen.getByLabelText("Current Status")).toBeInTheDocument();
      expect(screen.queryByRole("combobox", { name: /sort field/i })).not.toBeInTheDocument();
      expect(screen.queryByRole("combobox", { name: /sort order/i })).not.toBeInTheDocument();
      expect(screen.getByRole("columnheader", { name: /Ticket Number/i })).toHaveAttribute("aria-sort", "none");
      expect(screen.getByRole("columnheader", { name: /Created/i })).toHaveAttribute("aria-sort", "none");
      expect(screen.getByRole("columnheader", { name: /Requested Priority/i })).toHaveAttribute("aria-sort", "none");
      expect(screen.getByRole("columnheader", { name: "Current Status" })).toBeInTheDocument();
      expect(screen.getByRole("columnheader", { name: /Last Updated/i })).toHaveAttribute("aria-sort", "descending");
      expect(screen.getByLabelText("Rows per page")).toBeInTheDocument();
      const table = screen.getByRole("table");
      expect(table).toHaveClass("lab2-ticket-table");
      expect(Array.from(table.querySelectorAll("colgroup col")).map((col) => col.className)).toEqual([
        "lab2-col-ticket-number",
        "lab2-col-created",
        "lab2-col-summary",
        "lab2-col-category",
        "lab2-col-priority",
        "lab2-col-status",
        "lab2-col-updated",
      ]);
      const headerNames = screen.getAllByRole("columnheader").map((header) =>
        (header.textContent ?? "").replace(/\s+/g, "").replace(/[↕↑↓]/g, "")
      );
      expect(headerNames).toEqual(["TicketNumber", "Created", "Summary", "Category", "RequestedPriority", "CurrentStatus", "LastUpdated"]);
      expect(screen.getAllByText("2026-08-20 16:00:00").length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText("Created: 2026-08-20 16:00:00").length).toBeGreaterThanOrEqual(1);
      expect(screen.getByRole("navigation", { name: /pagination/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /go to page 3/i })).toBeInTheDocument();
    });

    it("UI-27 keeps full Summary text in the DOM while using the two-line clamp container", async () => {
      const longSummary = "A very long summary that must remain complete in the DOM while the desktop table visually limits it to two lines with an ellipsis instead of slicing the underlying text";
      vi.spyOn(api, "fetchCategories").mockResolvedValue([]);
      vi.spyOn(api, "listTickets").mockResolvedValue({
        data: [
          {
            id: 1,
            ticketNumber: "2608-0001",
            summary: longSummary,
            category: { name: "Account and Access" },
            requestedPriority: "HIGH",
            currentStatus: "NEW",
            ticketDate: "2026-08-20T09:00:00.000Z",
            updatedAt: "2026-08-20T10:00:00.000Z",
          },
        ],
        meta: { page: 1, pageSize: 10, totalCount: 1, totalPages: 1, hasNextPage: false, hasPreviousPage: false },
      });

      renderWithProviders();
      const summaries = await screen.findAllByText(longSummary);
      const summary = summaries.find((element) => element.classList.contains("lab2-summary-clamp"));
      expect(summary).toBeDefined();
      expect(summary).toHaveClass("lab2-summary-clamp");
      expect(summary).toHaveTextContent(longSummary);
    });

    it("removes the Action column, keeps Ticket Number as a detail link, and supports row navigation (UI-25)", async () => {
      vi.spyOn(api, "fetchCategories").mockResolvedValue([]);
      vi.spyOn(api, "listTickets").mockResolvedValue({
        data: [
          { id: 1, ticketNumber: "2608-0001", summary: "Test", category: { name: "Hardware" }, requestedPriority: "LOW", currentStatus: "NEW", updatedAt: "2026-08-20T10:00:00.000Z" },
        ],
        meta: { page: 1, pageSize: 10, totalCount: 1, totalPages: 1, hasNextPage: false, hasPreviousPage: false },
      });

      renderWithProviders();

      await waitFor(() => expect(screen.getAllByText("2608-0001").length).toBeGreaterThan(0));
      expect(screen.queryByRole("columnheader", { name: "Action" })).not.toBeInTheDocument();
      expect(screen.queryByRole("link", { name: "Open" })).not.toBeInTheDocument();
      const ticketLinks = screen.getAllByRole("link", { name: "2608-0001" });
      expect(ticketLinks.length).toBeGreaterThanOrEqual(1);
      expect(ticketLinks[0]).toHaveAttribute("href", "/tickets/1");

      const desktopRow = screen.getAllByText("2608-0001")[0].closest("tr");
      expect(desktopRow).not.toBeNull();
      await userEvent.click(desktopRow!);
      expect(window.location.pathname).toBe("/tickets/1");
    });

    it("uses sortable headers to update sort/order query state (UI-25)", async () => {
      vi.spyOn(api, "fetchCategories").mockResolvedValue([]);
      const listSpy = vi.spyOn(api, "listTickets").mockResolvedValue({
        data: mockTickets,
        meta: { page: 1, pageSize: 10, totalCount: 2, totalPages: 1, hasNextPage: false, hasPreviousPage: false },
      });

      renderWithProviders();
      await waitFor(() => expect(screen.getAllByText("2608-0001").length).toBeGreaterThan(0));

      const ticketNumberSort = screen.getByRole("button", { name: /Sort by Ticket Number/i });
      await userEvent.click(ticketNumberSort);
      await waitFor(() => expect(listSpy).toHaveBeenLastCalledWith(expect.objectContaining({ sort: "ticketNumber", order: "desc" })));
      await waitFor(() => expect(screen.getByRole("columnheader", { name: /Ticket Number/i })).toHaveAttribute("aria-sort", "descending"));

      await userEvent.click(screen.getByRole("button", { name: /Sort by Ticket Number/i }));
      await waitFor(() => expect(listSpy).toHaveBeenLastCalledWith(expect.objectContaining({ sort: "ticketNumber", order: "asc" })));
      await waitFor(() => expect(screen.getByRole("columnheader", { name: /Ticket Number/i })).toHaveAttribute("aria-sort", "ascending"));
    });

    it("sorts Created through ticketDate with descending-first toggle behavior (UI-27)", async () => {
      vi.spyOn(api, "fetchCategories").mockResolvedValue([]);
      const listSpy = vi.spyOn(api, "listTickets").mockResolvedValue({
        data: mockTickets,
        meta: { page: 1, pageSize: 10, totalCount: 2, totalPages: 1, hasNextPage: false, hasPreviousPage: false },
      });

      renderWithProviders();
      await waitFor(() => expect(screen.getAllByText("2608-0001").length).toBeGreaterThan(0));

      await userEvent.click(screen.getByRole("button", { name: /Sort by Created/i }));
      await waitFor(() => expect(listSpy).toHaveBeenLastCalledWith(expect.objectContaining({ sort: "ticketDate", order: "desc" })));
      await waitFor(() => expect(screen.getByRole("columnheader", { name: /Created/i })).toHaveAttribute("aria-sort", "descending"));

      await userEvent.click(screen.getByRole("button", { name: /Sort by Created/i }));
      await waitFor(() => expect(listSpy).toHaveBeenLastCalledWith(expect.objectContaining({ sort: "ticketDate", order: "asc" })));
      await waitFor(() => expect(screen.getByRole("columnheader", { name: /Created/i })).toHaveAttribute("aria-sort", "ascending"));
      expect(screen.getByRole("button", { name: /Sort mobile by Created/i })).toBeInTheDocument();
    });

    it("retries loading on Retry click (UI-09)", async () => {
      vi.spyOn(api, "fetchCategories").mockResolvedValue([]);
      const listSpy = vi.spyOn(api, "listTickets")
        .mockRejectedValueOnce(new Error("Network error"))
        .mockResolvedValue({
          data: [{ id: 1, ticketNumber: "2608-0001", summary: "Test", category: { name: "Hardware" }, requestedPriority: "LOW", currentStatus: "NEW", updatedAt: "2026-08-20T10:00:00.000Z" }],
          meta: { page: 1, pageSize: 10, totalCount: 1, totalPages: 1, hasNextPage: false, hasPreviousPage: false },
        });

      renderWithProviders();

      await waitFor(() => expect(screen.getByText("Unable to connect to TokTickIT API")).toBeInTheDocument(), { timeout: 3000 });
      await userEvent.click(screen.getByRole("button", { name: "Retry" }));
      await waitFor(() => expect(screen.getAllByText("2608-0001").length).toBeGreaterThan(0), { timeout: 3000 });
      expect(listSpy).toHaveBeenCalledTimes(2);
    });
  });

  describe("Requester race protection", () => {
    it("keeps requester B tickets when requester A resolves later", async () => {
      const requesterAResult = deferred<any>();
      const requesterBResult = deferred<any>();
      vi.spyOn(api, "fetchCategories").mockResolvedValue([]);
      vi.spyOn(api, "listTickets").mockImplementation(({ requesterId }) =>
        requesterId === 1 ? requesterAResult.promise : requesterBResult.promise
      );

      renderWithProviders();
      await waitFor(() => expect(api.listTickets).toHaveBeenCalledWith(expect.objectContaining({ requesterId: 1 })));

      const requesterB = { id: 2, name: "Requester B", email: "b@test.com" };
      localStorage.setItem("toktickit.requester", JSON.stringify(requesterB));
      act(() => {
        window.dispatchEvent(new StorageEvent("storage", {
          key: "toktickit.requester",
          newValue: JSON.stringify(requesterB),
        }));
      });
      await waitFor(() => expect(api.listTickets).toHaveBeenCalledWith(expect.objectContaining({ requesterId: 2 })));

      await act(async () => {
        requesterBResult.resolve({
          data: [{ id: 2, ticketNumber: "B-0001", summary: "Requester B ticket", category: { name: "Hardware" }, requestedPriority: "LOW", currentStatus: "NEW", updatedAt: "2026-08-20T10:00:00.000Z" }],
          meta: { page: 1, pageSize: 10, totalCount: 1, totalPages: 1, hasNextPage: false, hasPreviousPage: false },
        });
      });
      await waitFor(() => expect(screen.getAllByText("B-0001").length).toBeGreaterThan(0));

      await act(async () => {
        requesterAResult.resolve({
          data: [{ id: 1, ticketNumber: "A-0001", summary: "Requester A ticket", category: { name: "Hardware" }, requestedPriority: "HIGH", currentStatus: "NEW", updatedAt: "2026-08-20T10:00:00.000Z" }],
          meta: { page: 1, pageSize: 10, totalCount: 1, totalPages: 1, hasNextPage: false, hasPreviousPage: false },
        });
      });

      expect(screen.queryByText("A-0001")).not.toBeInTheDocument();
      expect(screen.getAllByText("B-0001").length).toBeGreaterThan(0);
    });

    it("ignores a stale requester failure without ending the latest loading state", async () => {
      const requesterAResult = deferred<any>();
      const requesterBResult = deferred<any>();
      vi.spyOn(api, "fetchCategories").mockResolvedValue([]);
      vi.spyOn(api, "listTickets").mockImplementation(({ requesterId }) =>
        requesterId === 1 ? requesterAResult.promise : requesterBResult.promise
      );

      renderWithProviders();
      await waitFor(() => expect(api.listTickets).toHaveBeenCalledWith(expect.objectContaining({ requesterId: 1 })));

      const requesterB = { id: 2, name: "Requester B", email: "b@test.com" };
      act(() => {
        window.dispatchEvent(new StorageEvent("storage", {
          key: "toktickit.requester",
          newValue: JSON.stringify(requesterB),
        }));
      });
      await waitFor(() => expect(api.listTickets).toHaveBeenCalledWith(expect.objectContaining({ requesterId: 2 })));

      await act(async () => requesterAResult.reject(new Error("stale requester failure")));
      expect(screen.getByText("Loading tickets…")).toBeInTheDocument();
      expect(screen.queryByText("Unable to connect to TokTickIT API")).not.toBeInTheDocument();

      await act(async () => {
        requesterBResult.resolve({
          data: [],
          meta: { page: 1, pageSize: 10, totalCount: 0, totalPages: 0, hasNextPage: false, hasPreviousPage: false },
        });
      });
      await waitFor(() => expect(screen.queryByText("Loading tickets…")).not.toBeInTheDocument());
    });
  });

  describe("Category metadata states", () => {
    it("shows a category error and retries without hiding loaded tickets", async () => {
      const categorySpy = vi.spyOn(api, "fetchCategories")
        .mockRejectedValueOnce(new Error("Category service unavailable"))
        .mockResolvedValueOnce([{ id: 1, name: "Hardware" }]);
      vi.spyOn(api, "listTickets").mockResolvedValue({
        data: [{ id: 1, ticketNumber: "2608-0001", summary: "Test", category: { name: "Hardware" }, requestedPriority: "LOW", currentStatus: "NEW", updatedAt: "2026-08-20T10:00:00.000Z" }],
        meta: { page: 1, pageSize: 10, totalCount: 1, totalPages: 1, hasNextPage: false, hasPreviousPage: false },
      });

      renderWithProviders();
      await waitFor(() => expect(screen.getByText("Unable to load categories")).toBeInTheDocument());
      expect(screen.getAllByText("2608-0001").length).toBeGreaterThan(0);

      await userEvent.click(screen.getByRole("button", { name: "Retry categories" }));
      await waitFor(() => expect(screen.getByRole("option", { name: "Hardware" })).toBeInTheDocument());
      expect(categorySpy).toHaveBeenCalledTimes(2);
    });
  });
});

describe("formatBangkok", () => {
  it("formats UTC input as YYYY-MM-DD HH:mm:ss in Asia/Bangkok", () => {
    expect(formatBangkok("2026-08-20T17:30:45.000Z")).toBe("2026-08-21 00:30:45");
  });

  it("returns invalid input unchanged", () => {
    expect(formatBangkok("not-a-date")).toBe("not-a-date");
  });
});
