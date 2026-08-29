import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";

// Issue 4 — verify GET /api/categories reads the seeded categories from
// PostgreSQL (via Prisma) and returns them ordered by name ASC (Lab 2).
// Requires the DB to be migrated and seeded first (Issue 3).
describe("GET /api/categories", () => {
  it("returns 200 with the four seeded categories in name order", async () => {
    const res = await request(app).get("/api/categories");

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(4);

    const names = res.body.map((c: { name: string }) => c.name);
    expect(names).toEqual([
      "Account and Access",
      "Hardware",
      "Network",
      "Software",
    ]);

    res.body.forEach((c: { id: number; name: string }) => {
      expect(typeof c.id).toBe("number");
      expect(typeof c.name).toBe("string");
    });
  });
});