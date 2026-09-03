import { describe, expect, it } from "vitest";
import {
  DESC_MAX,
  DESC_MIN,
  SUMMARY_MAX,
  SUMMARY_MIN,
  isDescriptionValid,
  isPriorityValid,
  isSummaryValid,
  trimValue,
} from "../validation.js";

describe("validation helpers (UNIT-03 / UNIT-04)", () => {
  it("trims surrounding whitespace without changing internal content", () => {
    expect(trimValue("  hello  world  ")).toBe("hello  world");
  });

  it("validates Summary boundaries after trim", () => {
    expect(isSummaryValid(`  ${"a".repeat(SUMMARY_MIN)}  `)).toBe(true);
    expect(isSummaryValid("a".repeat(SUMMARY_MAX))).toBe(true);
    expect(isSummaryValid("a".repeat(SUMMARY_MIN - 1))).toBe(false);
    expect(isSummaryValid("a".repeat(SUMMARY_MAX + 1))).toBe(false);
  });

  it("validates Description boundaries after trim", () => {
    expect(isDescriptionValid(`  ${"a".repeat(DESC_MIN)}  `)).toBe(true);
    expect(isDescriptionValid("a".repeat(DESC_MAX))).toBe(true);
    expect(isDescriptionValid("a".repeat(DESC_MIN - 1))).toBe(false);
    expect(isDescriptionValid("a".repeat(DESC_MAX + 1))).toBe(false);
  });

  it("accepts only the documented Requested Priority enum", () => {
    for (const priority of ["LOW", "MEDIUM", "HIGH", "CRITICAL"]) {
      expect(isPriorityValid(priority)).toBe(true);
    }
    for (const invalid of ["", "low", "URGENT", "NEW"]) {
      expect(isPriorityValid(invalid)).toBe(false);
    }
  });
});
