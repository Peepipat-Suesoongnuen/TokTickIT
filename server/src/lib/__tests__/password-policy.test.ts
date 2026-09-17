import { describe, expect, it } from "vitest";
import { validateNewPassword } from "../password-policy.js";

describe("password-policy (UNIT-01)", () => {
  it("accepts 8 and 64 code-point boundaries including multibyte", () => {
    expect(validateNewPassword("Abcdef1!", "Other!2x")).toEqual([]);
    // Sketch fix: "ä".repeat(63) + "!" has no uppercase letter, so it cannot
    // satisfy the upper+lower+special contract; use a leading "Ä" instead.
    const multi64 = "Ä" + "ä".repeat(62) + "!";
    expect([...multi64].length).toBe(64);
    expect(validateNewPassword(multi64, "Other!2x")).toEqual([]);
  });
  it("rejects 7 and 65 code points", () => {
    expect(validateNewPassword("Abcde1!", "Other!2x").length).toBeGreaterThan(0);
    expect(validateNewPassword("A".repeat(64) + "a1!", "Other!2x").length).toBeGreaterThan(0);
  });
  it("rejects missing character classes and same-as-current", () => {
    expect(validateNewPassword("abcdef1!", "Other!2x").length).toBeGreaterThan(0); // no upper
    expect(validateNewPassword("ABCDEF1!", "Other!2x").length).toBeGreaterThan(0); // no lower
    expect(validateNewPassword("Abcdef12", "Other!2x").length).toBeGreaterThan(0); // no special
    expect(validateNewPassword("Abcdef1!", "Abcdef1!").length).toBeGreaterThan(0); // same as current
  });
  it("does not trim: surrounding spaces count as characters", () => {
    expect(validateNewPassword("  Abcdef1!  ", "Other!2x")).toEqual([]);
  });
});
