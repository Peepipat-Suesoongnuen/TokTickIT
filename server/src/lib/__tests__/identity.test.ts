import { describe, expect, it } from "vitest";
import { canonicalizeEmail, emailsEqual, isEmailValid } from "../identity.js";

describe("identity (UNIT-02, BR-40/BR-46)", () => {
  it("trims and lowercases to a stable canonical value", () => {
    expect(canonicalizeEmail("  Alice@Example.COM  ")).toBe("alice@example.com");
  });

  it("treats case-only variants as the same account", () => {
    expect(emailsEqual("Alice@x", "alice@X")).toBe(true);
    expect(emailsEqual("alice@x", "bob@x")).toBe(false);
  });

  it("accepts well-formed addresses and rejects malformed ones (Issue #50)", () => {
    expect(isEmailValid("alice@example.com")).toBe(true);
    expect(isEmailValid("a.b+c@sub.example.co")).toBe(true);
    expect(isEmailValid("plainaddress")).toBe(false);
    expect(isEmailValid("@example.com")).toBe(false);
    expect(isEmailValid("alice@")).toBe(false);
    expect(isEmailValid("alice@example")).toBe(false);
    expect(isEmailValid("alice @example.com")).toBe(false);
    expect(isEmailValid("alice@@example.com")).toBe(false);
    expect(isEmailValid("")).toBe(false);
  });
});
