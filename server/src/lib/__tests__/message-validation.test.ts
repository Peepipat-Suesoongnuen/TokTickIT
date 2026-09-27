import { describe, it, expect } from "vitest";
import {
  isPublicCommentValid,
  isInternalNoteValid,
  normalizeMessageContent,
  PUBLIC_COMMENT_MAX,
  INTERNAL_NOTE_MAX,
} from "../validation.js";

// Issue #49 (Lab 3) — UNIT-05: Public Comment / Internal Note trim +
// channel-specific length validation (BR-36–BR-38, AC-12).
describe("message content validation (UNIT-05)", () => {
  it("rejects whitespace-only and empty Public Comments", () => {
    expect(isPublicCommentValid("")).toBe(false);
    expect(isPublicCommentValid("   ")).toBe(false);
    expect(isPublicCommentValid("\t\n ")).toBe(false);
    expect(isPublicCommentValid(undefined)).toBe(false);
    expect(isPublicCommentValid(null)).toBe(false);
    expect(isPublicCommentValid(42)).toBe(false);
  });

  it("enforces the 1–200 Public Comment window after trim", () => {
    expect(PUBLIC_COMMENT_MAX).toBe(200);
    expect(isPublicCommentValid("a")).toBe(true);
    expect(isPublicCommentValid("x".repeat(200))).toBe(true);
    expect(isPublicCommentValid("x".repeat(201))).toBe(false);
    // Padding does not extend the budget.
    expect(isPublicCommentValid(`  ${"x".repeat(200)}  `)).toBe(true);
    expect(isPublicCommentValid(`  ${"x".repeat(201)}  `)).toBe(false);
  });

  it("rejects whitespace-only and empty Internal Notes", () => {
    expect(isInternalNoteValid("")).toBe(false);
    expect(isInternalNoteValid("   ")).toBe(false);
    expect(isInternalNoteValid(undefined)).toBe(false);
    expect(isInternalNoteValid(null)).toBe(false);
    expect(isInternalNoteValid({})).toBe(false);
  });

  it("enforces the 1–2000 Internal Note window after trim", () => {
    expect(INTERNAL_NOTE_MAX).toBe(2000);
    expect(isInternalNoteValid("a")).toBe(true);
    expect(isInternalNoteValid("x".repeat(2000))).toBe(true);
    expect(isInternalNoteValid("x".repeat(2001))).toBe(false);
    // A comment-length value is valid as a note; a note-length value is
    // never valid as a comment (channel separation).
    expect(isInternalNoteValid("x".repeat(200))).toBe(true);
    expect(isPublicCommentValid("x".repeat(500))).toBe(false);
  });

  it("normalizes stored text by trimming outer whitespace", () => {
    expect(normalizeMessageContent("  hello  ")).toBe("hello");
    expect(normalizeMessageContent("kept\ttabs")).toBe("kept\ttabs");
  });
});
