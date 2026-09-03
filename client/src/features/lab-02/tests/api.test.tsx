import { afterEach, describe, expect, it, vi } from "vitest";
import { listTickets } from "../../../api.js";

const meta = {
  page: 1,
  pageSize: 10,
  totalCount: 1,
  totalPages: 1,
  hasNextPage: false,
  hasPreviousPage: false,
};

function responseWith(data: unknown[]) {
  return new Response(JSON.stringify({ data, meta }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("My Tickets API response boundary", () => {
  it("accepts a valid required and parseable ticketDate", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        responseWith([
          {
            id: 1,
            ticketNumber: "2609-0001",
            summary: "Valid Ticket Date",
            category: { id: 1, name: "Hardware" },
            relatedSystem: { id: 1, name: "Email" },
            requestedPriority: "LOW",
            currentStatus: "NEW",
            ticketDate: "2026-09-03T10:00:00.000Z",
            updatedAt: "2026-09-03T11:00:00.000Z",
            requester: { id: 1 },
          },
        ]),
      ),
    );

    const result = await listTickets({ requesterId: 1 });
    expect(result.data[0].ticketDate).toBe("2026-09-03T10:00:00.000Z");
  });

  it("rejects a list item when ticketDate is missing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        responseWith([
          {
            id: 1,
            ticketNumber: "2609-0001",
            summary: "Missing Ticket Date",
            updatedAt: "2026-09-03T11:00:00.000Z",
          },
        ]),
      ),
    );

    await expect(listTickets({ requesterId: 1 })).rejects.toThrow(/invalid.*ticketDate/i);
  });

  it("rejects a list item when ticketDate is not parseable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        responseWith([
          {
            id: 1,
            ticketNumber: "2609-0001",
            summary: "Invalid Ticket Date",
            ticketDate: "not-a-date",
            updatedAt: "2026-09-03T11:00:00.000Z",
          },
        ]),
      ),
    );

    await expect(listTickets({ requesterId: 1 })).rejects.toThrow(/invalid.*ticketDate/i);
  });

  it("rejects a parseable ticketDate that is not an ISO 8601 UTC timestamp", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        responseWith([
          {
            id: 1,
            ticketNumber: "2609-0001",
            summary: "Non ISO Ticket Date",
            ticketDate: "September 3, 2026 10:00:00 GMT",
            updatedAt: "2026-09-03T11:00:00.000Z",
          },
        ]),
      ),
    );

    await expect(listTickets({ requesterId: 1 })).rejects.toThrow(/invalid.*ticketDate/i);
  });
});
