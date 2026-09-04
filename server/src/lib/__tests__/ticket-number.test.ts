import { describe, expect, it } from "vitest";
import { formatTicketNumber, formatYYMM, getNextSequence } from "../ticket-number.js";

function txWithLatest(ticketNumber: string | null) {
  return {
    ticket: {
      findFirst: async () => (ticketNumber ? { ticketNumber } : null),
    },
  };
}

describe("ticket-number helpers (UNIT-01 / UNIT-02)", () => {
  it("formats YYMM correctly across month and year boundaries", () => {
    expect(formatYYMM(new Date(2026, 0, 1))).toBe("2601");
    expect(formatYYMM(new Date(2026, 11, 31))).toBe("2612");
    expect(formatYYMM(new Date(2027, 0, 1))).toBe("2701");
  });

  it("formats the official Ticket Number with a four-digit sequence", () => {
    expect(formatTicketNumber("2609", 1)).toBe("2609-0001");
    expect(formatTicketNumber("2609", 42)).toBe("2609-0042");
    expect(formatTicketNumber("2609", 9999)).toBe("2609-9999");
    expect(() => formatTicketNumber("2609", 10_000)).toThrow("INVALID_TICKET_SEQUENCE");
  });

  it("starts at sequence 1 when the current YYMM has no Ticket", async () => {
    await expect(getNextSequence(txWithLatest(null), "2609")).resolves.toBe(1);
  });

  it("increments deterministically from the current YYMM maximum", async () => {
    await expect(getNextSequence(txWithLatest("2609-0042"), "2609")).resolves.toBe(43);
  });

  it("signals exhaustion before a five-digit Ticket Number can be produced", async () => {
    await expect(getNextSequence(txWithLatest("2609-9999"), "2609")).rejects.toThrow("SEQUENCE_EXHAUSTED");
  });
});
