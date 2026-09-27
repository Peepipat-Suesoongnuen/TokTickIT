import { describe, expect, it } from "vitest";
import { createSessionToken, isSessionExpired } from "../session.js";

describe("session helpers (UNIT-03)", () => {
  it("creates unique tokens with SHA-256 hashes, never the raw token", async () => {
    const a = createSessionToken();
    const b = createSessionToken();
    expect(a.token).not.toBe(b.token);
    expect(a.tokenHash).not.toBe(b.tokenHash);
    expect(a.tokenHash).not.toContain(a.token);
    expect(a.tokenHash).toMatch(/^[0-9a-f]{64}$/);
  });
  it("expires at exactly 8h with no sliding", () => {
    const created = new Date("2026-09-17T00:00:00.000Z");
    const expires = new Date(created.getTime() + 8 * 3600 * 1000);
    expect(isSessionExpired(expires, new Date("2026-09-17T07:59:59.000Z"))).toBe(false);
    expect(isSessionExpired(expires, new Date("2026-09-17T08:00:00.000Z"))).toBe(true);
  });
});
