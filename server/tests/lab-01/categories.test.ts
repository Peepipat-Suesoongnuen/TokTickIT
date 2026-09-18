import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import { SESSION_COOKIE_NAME, getApprovedOrigins } from "../../src/auth.js";
import { hashPassword } from "../../src/lib/password-hash.js";

// Issue 4 — verify GET /api/categories reads the seeded categories from
// PostgreSQL (via Prisma) and returns them ordered by name ASC (Lab 2).
// Requires the DB to be migrated and seeded first (Issue 3).
// Reviewer fix 2 (Issue #45): the route is now session-gated, so this test
// logs in first (test-only change; all original assertions kept).
describe("GET /api/categories", () => {
  const prisma = getPrisma();
  const ORIGIN = getApprovedOrigins()[0] ?? "http://localhost:5173";
  const PASSWORD = "Lab01-Valid-9!";
  const userEmail = `lab01-categories-${Date.now()}@test.local`;

  beforeAll(async () => {
    await prisma.user.create({
      data: {
        name: "Lab 01 Categories User",
        email: userEmail,
        passwordHash: await hashPassword(PASSWORD),
        role: "REQUESTER",
        isActive: true,
        mustChangePassword: false,
      },
    });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: userEmail } });
  });

  it("returns 200 with the four seeded categories in name order", async () => {
    const login = await request(app)
      .post("/api/auth/login")
      .set("Origin", ORIGIN)
      .send({ email: userEmail, password: PASSWORD })
      .expect(200);
    const setCookie = login.headers["set-cookie"];
    const cookies: string[] = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
    const cookie = cookies.find((c) => c.startsWith(`${SESSION_COOKIE_NAME}=`))!.split(";")[0];

    const res = await request(app).get("/api/categories").set("Cookie", cookie);

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