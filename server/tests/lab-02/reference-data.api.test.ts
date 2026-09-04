import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";

describe.sequential("Reference data API (API-01 / API-02 / API-03)", () => {
  const prisma = getPrisma();
  const marker = `issue19-${Date.now()}`;
  const inactiveRequesterEmail = `${marker}-inactive@test.local`;
  const inactiveCategoryName = `${marker} Inactive Category`;
  const inactiveSystemName = `${marker} Inactive System`;

  beforeAll(async () => {
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
    const [categoriesRes, systemsRes] = await Promise.all([
      request(app).get("/api/categories").expect(200),
      request(app).get("/api/related-systems").expect(200),
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
