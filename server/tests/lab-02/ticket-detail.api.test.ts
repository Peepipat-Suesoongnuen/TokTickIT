import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";

describe("GET /api/tickets/:id — Ticket Detail (Lab 2 Issue 10)", () => {
  const prisma = getPrisma();
  let requesterA: { id: number };
  let requesterB: { id: number };
  let category: { id: number };
  let relatedSystem: { id: number };
  let ticketA: { id: number; ticketNumber: string };
  let ticketB: { id: number; ticketNumber: string };

  // Isolated fixtures: targeted ticketNumbers, deterministic emails
  const TICKET_A_NUM = "2608-1101";
  const TICKET_B_NUM = "2608-1102";

  beforeAll(async () => {
    await prisma.ticket.deleteMany({
      where: { ticketNumber: { in: [TICKET_A_NUM, TICKET_B_NUM] } },
    });

    const cat = await prisma.category.upsert({
      where: { name: "Hardware" },
      update: {},
      create: { name: "Hardware", isActive: true },
    });
    category = cat;

    const sys = await prisma.relatedSystem.upsert({
      where: { name: "Email" },
      update: {},
      create: { name: "Email", isActive: true },
    });
    relatedSystem = sys;

    const reqA = await prisma.developmentRequester.upsert({
      where: { email: "requesterA-detail@test.com" },
      update: {},
      create: { name: "Requester A Detail", email: "requesterA-detail@test.com", isActive: true },
    });
    requesterA = { id: reqA.id };

    const reqB = await prisma.developmentRequester.upsert({
      where: { email: "requesterB-detail@test.com" },
      update: {},
      create: { name: "Requester B Detail", email: "requesterB-detail@test.com", isActive: true },
    });
    requesterB = { id: reqB.id };

    const tA = await prisma.ticket.create({
      data: {
        ticketNumber: TICKET_A_NUM,
        requesterId: requesterA.id,
        categoryId: category.id,
        relatedSystemId: relatedSystem.id,
        summary: "Detail ticket A",
        description: "Description for ticket A that is long enough to be valid for creation",
        requestedPriority: "HIGH",
        currentStatus: "NEW",
      },
    });
    ticketA = { id: tA.id, ticketNumber: tA.ticketNumber };

    const tB = await prisma.ticket.create({
      data: {
        ticketNumber: TICKET_B_NUM,
        requesterId: requesterB.id,
        categoryId: category.id,
        relatedSystemId: relatedSystem.id,
        summary: "Detail ticket B",
        description: "Description for ticket B that is long enough to be valid for creation",
        requestedPriority: "LOW",
        currentStatus: "NEW",
      },
    });
    ticketB = { id: tB.id, ticketNumber: tB.ticketNumber };

    // Create attachments for ticketA: one active, one removed (to verify detail includes both)
    await prisma.attachment.create({
      data: {
        ticketId: ticketA.id,
        originalFilename: "active.png",
        storedFilename: `detail-active-${Date.now()}.png`,
        mimeType: "image/png",
        sizeBytes: 12345,
      },
    });
    await prisma.attachment.create({
      data: {
        ticketId: ticketA.id,
        originalFilename: "removed.pdf",
        storedFilename: `detail-removed-${Date.now()}.pdf`,
        mimeType: "application/pdf",
        sizeBytes: 54321,
        removedAt: new Date(),
        removedReason: "Uploaded wrong file",
      },
    });
  });

  afterAll(async () => {
    await prisma.ticket.deleteMany({
      where: { ticketNumber: { in: [TICKET_A_NUM, TICKET_B_NUM] } },
    });
    await prisma.developmentRequester.deleteMany({
      where: { email: { in: ["requesterA-detail@test.com", "requesterB-detail@test.com", "inactive-detail@test.com"] } },
    });
  });

  describe("Ownership enforcement (AC-10, BR-09)", () => {
    it("should return 404 when B requests A's ticket (safe envelope)", async () => {
      const res = await request(app)
        .get(`/api/tickets/${ticketA.id}?requesterId=${requesterB.id}`)
        .expect(404);
      expect(res.body.error.code).toBe("NOT_FOUND");
      expect(res.body.error.message).toBe("Resource not found.");
    });

    it("should return 404 when A requests B's ticket", async () => {
      const res = await request(app)
        .get(`/api/tickets/${ticketB.id}?requesterId=${requesterA.id}`)
        .expect(404);
      expect(res.body.error.code).toBe("NOT_FOUND");
    });

    it("should return 404 for missing ticket id (not found)", async () => {
      const res = await request(app)
        .get(`/api/tickets/999999?requesterId=${requesterA.id}`)
        .expect(404);
      expect(res.body.error.code).toBe("NOT_FOUND");
    });
  });

  describe("Success — owned detail with attachments (FR-08, BR-17)", () => {
    it("should return 200 with full detail and attachments including removed", async () => {
      const res = await request(app)
        .get(`/api/tickets/${ticketA.id}?requesterId=${requesterA.id}`)
        .expect(200);

      expect(res.body.id).toBe(ticketA.id);
      expect(res.body.ticketNumber).toBe(TICKET_A_NUM);
      expect(res.body.requester.id).toBe(requesterA.id);
      expect(res.body.category.id).toBe(category.id);
      expect(res.body.relatedSystem.id).toBe(relatedSystem.id);
      expect(res.body).toHaveProperty("summary");
      expect(res.body).toHaveProperty("description");
      expect(res.body).toHaveProperty("attachments");
      expect(Array.isArray(res.body.attachments)).toBe(true);
      expect(res.body.attachments).toHaveLength(2);

      const active = res.body.attachments.find((a: any) => a.originalFilename === "active.png");
      const removed = res.body.attachments.find((a: any) => a.originalFilename === "removed.pdf");
      expect(active).toBeDefined();
      expect(active.removedAt).toBeNull();
      expect(active.removedReason).toBeNull();
      expect(removed).toBeDefined();
      expect(removed.removedAt).not.toBeNull();
      expect(removed.removedReason).toBe("Uploaded wrong file");
      // attachments ordered by createdAt asc
      expect(new Date(res.body.attachments[0].createdAt).getTime()).toBeLessThanOrEqual(
        new Date(res.body.attachments[1].createdAt).getTime()
      );
    });

    it("should return 200 for owned ticket B when requested by B", async () => {
      const res = await request(app)
        .get(`/api/tickets/${ticketB.id}?requesterId=${requesterB.id}`)
        .expect(200);
      expect(res.body.id).toBe(ticketB.id);
      expect(res.body.requester.id).toBe(requesterB.id);
    });
  });

  describe("Validation — requesterId and id (400)", () => {
    it("should return 400 for missing requesterId", async () => {
      const res = await request(app).get(`/api/tickets/${ticketA.id}`).expect(400);
      expect(res.body.error.code).toBe("VALIDATION_FAILED");
      expect(res.body.fieldErrors.requesterId).toBeDefined();
    });

    it("should return 400 for invalid requesterId (non-integer)", async () => {
      const res = await request(app).get(`/api/tickets/${ticketA.id}?requesterId=abc`).expect(400);
      expect(res.body.error.code).toBe("VALIDATION_FAILED");
      expect(res.body.fieldErrors.requesterId).toBeDefined();
    });

    it("should return 400 for invalid requesterId (zero)", async () => {
      const res = await request(app).get(`/api/tickets/${ticketA.id}?requesterId=0`).expect(400);
      expect(res.body.error.code).toBe("VALIDATION_FAILED");
      expect(res.body.fieldErrors.requesterId).toBeDefined();
    });

    it("should return 400 for inactive requesterId", async () => {
      const inactive = await prisma.developmentRequester.upsert({
        where: { email: "inactive-detail@test.com" },
        update: { isActive: false },
        create: { name: "Inactive Detail", email: "inactive-detail@test.com", isActive: false },
      });
      try {
        const res = await request(app)
          .get(`/api/tickets/${ticketA.id}?requesterId=${inactive.id}`)
          .expect(400);
        expect(res.body.error.code).toBe("VALIDATION_FAILED");
        expect(res.body.fieldErrors.requesterId).toBeDefined();
      } finally {
        await prisma.developmentRequester.delete({ where: { id: inactive.id } });
      }
    });

    it("should return 400 for duplicate requesterId query param", async () => {
      const res = await request(app)
        .get(`/api/tickets/${ticketA.id}?requesterId=${requesterA.id}&requesterId=${requesterB.id}`)
        .expect(400);
      expect(res.body.error.code).toBe("VALIDATION_FAILED");
    });

    it("should return 400 for invalid ticket id (non-integer string)", async () => {
      const res = await request(app).get(`/api/tickets/abc?requesterId=${requesterA.id}`).expect(400);
      expect(res.body.error.code).toBe("VALIDATION_FAILED");
      expect(res.body.fieldErrors.id).toBeDefined();
    });

    it("should return 400 for invalid ticket id (negative)", async () => {
      const res = await request(app).get(`/api/tickets/-5?requesterId=${requesterA.id}`).expect(400);
      expect(res.body.error.code).toBe("VALIDATION_FAILED");
      expect(res.body.fieldErrors.id).toBeDefined();
    });

    it("should return 400 for invalid ticket id (zero)", async () => {
      const res = await request(app).get(`/api/tickets/0?requesterId=${requesterA.id}`).expect(400);
      expect(res.body.error.code).toBe("VALIDATION_FAILED");
      expect(res.body.fieldErrors.id).toBeDefined();
    });

    it("should return 400 for unsafe integer ticket id", async () => {
      const res = await request(app)
        .get(`/api/tickets/9007199254740992?requesterId=${requesterA.id}`)
        .expect(400);
      expect(res.body.error.code).toBe("VALIDATION_FAILED");
      expect(res.body.fieldErrors.id).toBeDefined();
    });
  });
});
