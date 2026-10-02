import { describe, expect, it } from "vitest";
import {
  ACTION_DATE_TOLERANCE_HOURS,
  isActionDateInRange,
  isAttachmentNotesValid,
  isDescriptionValid,
  isFollowUpNoteValid,
  isResultValid,
  isUuid,
  normalizeCreateIntent,
} from "../action-validation.js";

// UNIT-01: action field validation incl. work-date bounds (BR-005–BR-007, AC-002/AC-009).
describe("action-validation (UNIT-01)", () => {
  it("accepts boundary-valid description/result/notes", () => {
    expect(isDescriptionValid("x".repeat(1))).toBe(true);
    expect(isDescriptionValid("x".repeat(1000))).toBe(true);
    expect(isResultValid("")).toBe(true);
    expect(isResultValid("x".repeat(2000))).toBe(true);
    expect(isAttachmentNotesValid("x".repeat(500))).toBe(true);
  });

  it("rejects empty, whitespace-only, overlong, and non-string inputs", () => {
    expect(isDescriptionValid("")).toBe(false);
    expect(isDescriptionValid("   ")).toBe(false);
    expect(isDescriptionValid("x".repeat(1001))).toBe(false);
    expect(isDescriptionValid(42 as unknown as string)).toBe(false);
    expect(isResultValid("x".repeat(2001))).toBe(false);
    expect(isAttachmentNotesValid("x".repeat(501))).toBe(false);
  });

  it("requires follow-up note iff followUpRequired", () => {
    expect(isFollowUpNoteValid(true, "note")).toBe(true);
    expect(isFollowUpNoteValid(true, "")).toBe(false);
    expect(isFollowUpNoteValid(true, "   ")).toBe(false);
    expect(isFollowUpNoteValid(true, "x".repeat(501))).toBe(false);
    expect(isFollowUpNoteValid(false, null)).toBe(true);
    expect(isFollowUpNoteValid(false, "optional")).toBe(true);
  });

  it("bounds actionDate within [ticketDate, now + tolerance]", () => {
    const ticketDate = new Date("2026-09-01T00:00:00.000Z");
    const now = new Date("2026-09-12T12:00:00.000Z");
    expect(isActionDateInRange(new Date("2026-09-01T00:00:00.000Z"), ticketDate, now)).toBe(true);
    expect(isActionDateInRange(new Date("2026-09-12T12:00:00.000Z"), ticketDate, now)).toBe(true);
    expect(isActionDateInRange(new Date("2026-08-31T23:59:59.000Z"), ticketDate, now)).toBe(false);
    expect(
      isActionDateInRange(
        new Date(now.getTime() + ACTION_DATE_TOLERANCE_HOURS * 36e5),
        ticketDate,
        now,
      ),
    ).toBe(true);
    expect(
      isActionDateInRange(
        new Date(now.getTime() + ACTION_DATE_TOLERANCE_HOURS * 36e5 + 1000),
        ticketDate,
        now,
      ),
    ).toBe(false);
    expect(isActionDateInRange("not-a-date" as unknown as Date, ticketDate, now)).toBe(false);
  });

  it("validates UUIDs and normalizes create intent deterministically", () => {
    expect(isUuid("05686a15-792b-59bd-937d-6fedffd102ba")).toBe(true);
    expect(isUuid("seed-a001")).toBe(false);
    expect(isUuid("")).toBe(false);
    const a = normalizeCreateIntent({
      description: "  Fix login  ",
      assignedToId: null,
      actionDate: "2026-09-12T12:00:00.000+07:00",
      followUpRequired: false,
      followUpNote: null,
      attachmentNotes: null,
      result: null,
    });
    const b = normalizeCreateIntent({
      description: "Fix login",
      assignedToId: null,
      actionDate: "2026-09-12T05:00:00.000Z",
      followUpRequired: false,
      followUpNote: null,
      attachmentNotes: null,
      result: null,
    });
    expect(a).toBe(b);
    expect(
      normalizeCreateIntent({
        description: "Fix login!",
        assignedToId: null,
        actionDate: "2026-09-12T05:00:00.000Z",
        followUpRequired: false,
        followUpNote: null,
        attachmentNotes: null,
        result: null,
      }),
    ).not.toBe(a);
  });
});
