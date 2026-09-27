import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import { SESSION_COOKIE_NAME, getApprovedOrigins } from "../../src/auth.js";
import { hashPassword } from "../../src/lib/password-hash.js";

// Reviewer fix 2 (Issue #45): GET /api/categories + /api/related-systems are
// now gated (requireSession -> requireActiveUser -> requirePasswordChanged),
// so these tests log in first. /api/requesters stays public (not gated).

const ORIGIN = getApprovedOrigins()[0] ?? "http://localhost:5173";
const PASSWORD = "RefData-Valid-9!";

describe.sequential("Reference data API (API-01 / API-02 / API-03)", () => {
  const prisma = getPrisma();
  const marker = `issue19-${Date.now()}`;
  const inactiveRequesterEmail = `${marker}-inactive@test.local`;
  const inactiveCategoryName = `${marker} Inactive Category`;
  const inactiveSystemName = `${marker} Inactive System`;
  const userEmail = `${marker}-refdata@test.local`;

  function sessionCookieValue(setCookie: unknown): string | undefined {
    const cookies: string[] = Array.isArray(setCookie)
      ? (setCookie as string[])
      : setCookie
        ? [setCookie as string]
        : [];
    const found = cookies.find((c) => c.startsWith(`${SESSION_COOKIE_NAME}=`));
    if (!found) return undefined;
    return found.split(";")[0];
  }

  async function loginAs(): Promise<string> {
    const res = await request(app)
      .post("/api/auth/login")
      .set("Origin", ORIGIN)
      .send({ email: userEmail, password: PASSWORD })
      .expect(200);
    const cookie = sessionCookieValue(res.headers["set-cookie"]);
    expect(cookie).toBeDefined();
    return cookie as string;
  }

  beforeAll(async () => {
    await prisma.user.create({
      data: {
        name: `${marker} Reference Data User`,
        email: userEmail,
        passwordHash: await hashPassword(PASSWORD),
        role: "REQUESTER",
        isActive: true,
        mustChangePassword: false,
      },
    });
    await prisma.developmentRequester.create({
      data: { name: `${marker} Inactive Requester`, email: inactiveRequesterEmail, isActive: false },
    });
    await prisma.category.create({
      data: { name: inactiveCategoryName, isActive: false },
    });
    await prisma.relatedSystem.create({
      data: { name: inactiveSystemName, isActive: false },
    });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: userEmail } });
    await prisma.developmentRequester.deleteMany({ where: { email: inactiveRequesterEmail } });
    await prisma.category.deleteMany({ where: { name: inactiveCategoryName } });
    await prisma.relatedSystem.deleteMany({ where: { name: inactiveSystemName } });
  });

  it("API-01 returns active-only requesters ordered by name", async () => {
    const res = await request(app).get("/api/requesters").expect(200);
    const emails = res.body.map((item: { email: string }) => item.email);
    const names = res.body.map((item: { name: string }) => item.name);

    expect(res.body.length).toBeGreaterThan(0);
    expect(emails).not.toContain(inactiveRequesterEmail);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });

  it("API-02 returns 200 [] for a controlled no-active-requester result", async () => {
    const findMany = vi.spyOn(prisma.developmentRequester, "findMany").mockResolvedValueOnce([]);
    try {
      const res = await request(app).get("/api/requesters").expect(200);
      expect(res.body).toEqual([]);
    } finally {
      findMany.mockRestore();
    }
  });

  it("API-03 returns active-only categories and related systems ordered by name", async () => {
    const cookie = await loginAs();
    const [categoriesRes, systemsRes] = await Promise.all([
      request(app).get("/api/categories").set("Cookie", cookie).expect(200),
      request(app).get("/api/related-systems").set("Cookie", cookie).expect(200),
    ]);

    const categoryNames = categoriesRes.body.map((item: { name: string }) => item.name);
    expect(categoryNames.length).toBeGreaterThan(0);
    expect(categoryNames).not.toContain(inactiveCategoryName);
    expect(categoryNames).toEqual([...categoryNames].sort((a, b) => a.localeCompare(b)));

    const systemNames = systemsRes.body.map((item: { name: string }) => item.name);
    expect(systemNames.length).toBeGreaterThan(0);
    expect(systemNames).not.toContain(inactiveSystemName);
    expect(systemNames).toEqual([...systemNames].sort((a, b) => a.localeCompare(b)));
  });
});
