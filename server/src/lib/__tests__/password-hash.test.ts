import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "../password-hash.js";

describe("password-hash (UNIT-07, BR-10)", () => {
  it("hashes to PHC Argon2id with at least m=19456,t=2,p=1 and verifies", async () => {
    const hash = await hashPassword("Local-Seed-1!");
    expect(hash).toMatch(/^\$argon2id\$v=\d+\$m=(\d+),t=(\d+),p=(\d+)\$/);
    const [, m, t, p] = hash.match(/m=(\d+),t=(\d+),p=(\d+)/)!.map(Number);
    expect(m).toBeGreaterThanOrEqual(19456);
    expect(t).toBeGreaterThanOrEqual(2);
    expect(p).toBeGreaterThanOrEqual(1);
    await expect(verifyPassword(hash, "Local-Seed-1!")).resolves.toBe(true);
  });

  it("uses a unique salt per hash and rejects wrong passwords", async () => {
    const a = await hashPassword("Local-Seed-1!");
    const b = await hashPassword("Local-Seed-1!");
    expect(a).not.toBe(b);
    await expect(verifyPassword(a, "wrong-password")).resolves.toBe(false);
  });

  it("verifies a multibyte 64-code-point password and never stores plaintext", async () => {
    const pw = "ä".repeat(63) + "!";
    expect([...pw].length).toBe(64);
    const hash = await hashPassword(pw);
    expect(hash).not.toContain(pw);
    await expect(verifyPassword(hash, pw)).resolves.toBe(true);
  });
});
