import { describe, expect, it } from "vitest";
import { canonicalizeEmail, emailsEqual } from "../identity.js";

describe("identity (UNIT-02, BR-40/BR-46)", () => {
  it("trims and lowercases to a stable canonical value", () => {
    expect(canonicalizeEmail("  Alice@Example.COM  ")).toBe("alice@example.com");
  });

  it("treats case-only variants as the same account", () => {
    expect(emailsEqual("Alice@x", "alice@X")).toBe(true);
    expect(emailsEqual("alice@x", "bob@x")).toBe(false);
  });
});
