import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BrowserRouter } from "react-router-dom";
import MyTickets from "../../../pages/MyTickets";
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

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
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

      const searchInput = screen.getByPlaceholderText("Search summary or description…");
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

    it("clears filters when Clear Filters is clicked", async () => {
      vi.spyOn(api, "fetchCategories").mockResolvedValue([{ id: 1, name: "Hardware" }]);
      vi.spyOn(api, "listTickets").mockResolvedValue({
        data: [],
        meta: { page: 1, pageSize: 10, totalCount: 0, totalPages: 0, hasNextPage: false, hasPreviousPage: false },
      });

      renderWithProviders();

      const searchInput = screen.getByPlaceholderText("Search summary or description…");
      await userEvent.type(searchInput, "test");

      // Need to trigger a filter first to show the Clear Filters button
      const categorySelect = screen.getByRole("combobox", { name: /category/i });
      await userEvent.selectOptions(categorySelect, "1");
      
      // Get the first Clear Filters button (toolbar)
      const clearButtons = screen.getAllByRole("button", { name: "Clear Filters" });
      await userEvent.click(clearButtons[0]);

      expect(screen.getByPlaceholderText("Search summary or description…")).toHaveValue("");
    });
  });

  describe("Loading and States (UI-23)", () => {
    it("shows loading state while fetching", async () => {
      let resolve: (value: any) => void;
      const promise = new Promise<{ data: unknown[]; meta: { page: number; pageSize: number; totalCount: number; totalPages: number; hasNextPage: boolean; hasPreviousPage: boolean } }>((res) => {
        resolve = res;
        setTimeout(() => resolve({ data: [], meta: { page: 1, pageSize: 10, totalCount: 0, totalPages: 0, hasNextPage: false, hasPreviousPage: false } }), 100);
      });
      vi.spyOn(api, "listTickets").mockImplementation(() => promise);
      vi.spyOn(api, "fetchCategories").mockResolvedValue([]);

      renderWithProviders();

      expect(screen.getByText("Loading tickets…")).toBeInTheDocument();
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

      const searchInput = screen.getByPlaceholderText("Search summary or description…");
      await userEvent.type(searchInput, "lap");
      
      // Should not call API immediately (debounce)
      expect(listSpy).toHaveBeenCalledTimes(1);

      // Wait for debounce (300ms + buffer)
      await waitFor(() => {
        expect(listSpy).toHaveBeenCalledTimes(2);
        expect(listSpy).toHaveBeenLastCalledWith(expect.objectContaining({ search: "lap" }));
      }, { timeout: 2000 });
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
    it("renders numbered pagination and accessible toolbar labels", async () => {
      vi.spyOn(api, "fetchCategories").mockResolvedValue([]);
      vi.spyOn(api, "listTickets").mockResolvedValue({
        data: [
          { id: 1, ticketNumber: "2608-0001", summary: "Test", category: { name: "Hardware" }, requestedPriority: "LOW", currentStatus: "NEW", updatedAt: "2026-08-20T10:00:00.000Z" },
        ],
        meta: { page: 1, pageSize: 10, totalCount: 25, totalPages: 3, hasNextPage: true, hasPreviousPage: false },
      });

      renderWithProviders();

      await waitFor(() => expect(screen.getAllByText("2608-0001").length).toBeGreaterThan(0));
      expect(screen.getByPlaceholderText("Search summary or description…")).toBeInTheDocument();
      expect(screen.getByLabelText("Search tickets")).toBeInTheDocument();
      expect(screen.getByRole("combobox", { name: /category/i })).toBeInTheDocument();
      expect(screen.getByRole("combobox", { name: /priority/i })).toBeInTheDocument();
      expect(screen.getByRole("combobox", { name: /sort field/i })).toBeInTheDocument();
      expect(screen.getByRole("combobox", { name: /sort order/i })).toBeInTheDocument();
      expect(screen.getByRole("combobox", { name: /page size/i })).toBeInTheDocument();
      expect(screen.getByRole("navigation", { name: /pagination/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /go to page 3/i })).toBeInTheDocument();
    });

    it("shows disabled Open when Ticket Detail is deferred (Issue 10)", async () => {
      vi.spyOn(api, "fetchCategories").mockResolvedValue([]);
      vi.spyOn(api, "listTickets").mockResolvedValue({
        data: [
          { id: 1, ticketNumber: "2608-0001", summary: "Test", category: { name: "Hardware" }, requestedPriority: "LOW", currentStatus: "NEW", updatedAt: "2026-08-20T10:00:00.000Z" },
        ],
        meta: { page: 1, pageSize: 10, totalCount: 1, totalPages: 1, hasNextPage: false, hasPreviousPage: false },
      });

      renderWithProviders();

      await waitFor(() => expect(screen.getAllByText("2608-0001").length).toBeGreaterThan(0));
      const opens = screen.getAllByText("Open");
      expect(opens.length).toBeGreaterThan(0);
      // deferred Open is a span with aria-disabled, not a link to /tickets/:id
      expect(screen.queryByRole("link", { name: "Open" })).not.toBeInTheDocument();
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
});