import { describe, it, expect } from "vitest";
import { isAllowedMime, isAllowedSize } from "../attachmentValidation.js";
describe("attachmentValidation", () => {
  it("allows JPG/PNG/WEBP/PDF", () => {
    expect(isAllowedMime("image/jpeg", ".jpg")).toBe(true);
    expect(isAllowedMime("image/jpeg", ".jpeg")).toBe(true);
    expect(isAllowedMime("image/png", ".png")).toBe(true);
    expect(isAllowedMime("image/webp", ".webp")).toBe(true);
    expect(isAllowedMime("application/pdf", ".pdf")).toBe(true);
    expect(isAllowedMime("IMAGE/PNG", ".PNG")).toBe(true);
  });
  it("rejects wrong type", () => {
    expect(isAllowedMime("text/plain", ".txt")).toBe(false);
    expect(isAllowedMime("image/jpeg", ".txt")).toBe(false);
    expect(isAllowedMime("text/plain", ".jpg")).toBe(false);
  });
  it("size limit 5MB", () => {
    expect(isAllowedSize(5 * 1024 * 1024)).toBe(true);
    expect(isAllowedSize(5 * 1024 * 1024 + 1)).toBe(false);
  });
});
