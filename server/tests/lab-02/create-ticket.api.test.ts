import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";

describe("Create Ticket API (Lab 2 Issue 8A)", () => {
  const prisma = getPrisma();

  const requesterEmail = "issue27-create-ticket@test.local";
  let requester: { id: number };
  let activeCategory: { id: number; name: string };
  let activeSystem: { id: number; name: string };

  beforeAll(async () => {
    const existingRequester = await prisma.developmentRequester.findUnique({
      where: { email: requesterEmail },
    });
    if (existingRequester) {
      await prisma.ticket.deleteMany({ where: { requesterId: existingRequester.id } });
    }

    const req = await prisma.developmentRequester.upsert({
      where: { email: requesterEmail },
      update: { name: "Issue 27 Create Ticket Requester", isActive: true },
      create: {
        name: "Issue 27 Create Ticket Requester",
        email: requesterEmail,
        isActive: true,
      },
    });
    requester = { id: req.id };

    const category = await prisma.category.findFirst({
      where: { isActive: true },
      orderBy: { name: "asc" },
    });
    if (!category) throw new Error("Issue 27 test requires seeded active Category data");
    activeCategory = { id: category.id, name: category.name };

    const system = await prisma.relatedSystem.findFirst({
      where: { isActive: true },
      orderBy: { name: "asc" },
    });
    if (!system) throw new Error("Issue 27 test requires seeded active RelatedSystem data");
    activeSystem = { id: system.id, name: system.name };
  });

  afterEach(async () => {
    if (requester) {
      await prisma.ticket.deleteMany({ where: { requesterId: requester.id } });
    }
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    if (requester) {
      await prisma.ticket.deleteMany({ where: { requesterId: requester.id } });
    }
    await prisma.developmentRequester.deleteMany({ where: { email: requesterEmail } });
  });

  function validPayload(overrides: Record<string, unknown> = {}) {
    return {
      requesterId: requester.id,
      categoryId: activeCategory.id,
      relatedSystemId: activeSystem.id,
      summary: "  Laptop battery drains quickly  ",
      description: "  Battery drops from full charge during normal office use.  ",
      requestedPriority: "MEDIUM",
      ...overrides,
    };
  }

  it("API-04 / AC-01 creates one ticket with backend-generated number, NEW status, and saved DB values", async () => {
    const res = await request(app).post("/api/tickets").send(validPayload()).expect(201);

    expect(res.body.id).toEqual(expect.any(Number));
    expect(res.body.ticketNumber).toMatch(/^\d{4}-\d{4}$/);
    expect(res.body.currentStatus).toBe("NEW");
    expect(res.body.summary).toBe("Laptop battery drains quickly");
    expect(res.body.description).toBe("Battery drops from full charge during normal office use.");
    expect(res.body.category).toEqual({ id: activeCategory.id, name: activeCategory.name });
    expect(res.body.relatedSystem).toEqual({ id: activeSystem.id, name: activeSystem.name });
    expect(res.body.requester).toEqual({ id: requester.id, name: "Issue 27 Create Ticket Requester" });
    expect(res.body.attachments).toEqual([]);
    expect(new Date(res.body.ticketDate).toString()).not.toBe("Invalid Date");

    const saved = await prisma.ticket.findUnique({ where: { id: res.body.id } });
    expect(saved).not.toBeNull();
    expect(saved?.ticketNumber).toBe(res.body.ticketNumber);
    expect(saved?.requesterId).toBe(requester.id);
    expect(saved?.categoryId).toBe(activeCategory.id);
    expect(saved?.relatedSystemId).toBe(activeSystem.id);
    expect(saved?.summary).toBe("Laptop battery drains quickly");
    expect(saved?.description).toBe("Battery drops from full charge during normal office use.");
    expect(saved?.requestedPriority).toBe("MEDIUM");
    expect(saved?.currentStatus).toBe("NEW");
  });

  it.each([
    ["summary below minimum", { summary: "abcd" }, "summary", "Summary must contain 5–120 characters."],
    ["summary above maximum", { summary: "x".repeat(121) }, "summary", "Summary must contain 5–120 characters."],
    ["description below minimum", { description: "x".repeat(19) }, "description", "Description must contain 20–2,000 characters."],
    ["description above maximum", { description: "x".repeat(2001) }, "description", "Description must contain 20–2,000 characters."],
  ])("API-05 rejects %s with the documented 400 field error", async (_name, override, field, message) => {
    const before = await prisma.ticket.count({ where: { requesterId: requester.id } });
    const res = await request(app).post("/api/tickets").send(validPayload(override)).expect(400);

    expect(res.body.error).toEqual({
      code: "VALIDATION_FAILED",
      message: "One or more fields are invalid.",
    });
    expect(res.body.fieldErrors[field]).toBe(message);
    expect(await prisma.ticket.count({ where: { requesterId: requester.id } })).toBe(before);
  });

  it.each([
    ["unknown category", () => ({ categoryId: 2_147_483_647 }), "categoryId", "categoryId must reference an active category."],
    ["unknown related system", () => ({ relatedSystemId: 2_147_483_647 }), "relatedSystemId", "relatedSystemId must reference an active related system."],
    ["invalid priority", () => ({ requestedPriority: "URGENT" }), "requestedPriority", "requestedPriority must be one of LOW, MEDIUM, HIGH, CRITICAL."],
  ])("API-06 rejects %s with 400", async (_name, makeOverride, field, message) => {
    const res = await request(app)
      .post("/api/tickets")
      .send(validPayload(makeOverride()))
      .expect(400);

    expect(res.body.error.code).toBe("VALIDATION_FAILED");
    expect(res.body.fieldErrors[field]).toBe(message);
  });

  it("API-07 / BR-08 binds the created ticket to the submitted requesterId", async () => {
    const res = await request(app)
      .post("/api/tickets")
      .send(validPayload({ summary: "Requester binding proof" }))
      .expect(201);

    const saved = await prisma.ticket.findUnique({ where: { id: res.body.id } });
    expect(saved?.requesterId).toBe(requester.id);
    expect(res.body.requester.id).toBe(requester.id);
  });

  it("API-23 returns the safe generic 500 envelope when a Prisma dependency fails", async () => {
    const fault = vi
      .spyOn(prisma.developmentRequester, "findFirst")
      .mockRejectedValueOnce(new Error("forced internal database detail"));

    try {
      const res = await request(app).post("/api/tickets").send(validPayload()).expect(500);

      expect(res.body).toEqual({
        error: {
          code: "INTERNAL_ERROR",
          message: "An unexpected error occurred. Please try again.",
        },
      });
      expect(JSON.stringify(res.body)).not.toContain("forced internal database detail");
    } finally {
      fault.mockRestore();
    }
  });
});
