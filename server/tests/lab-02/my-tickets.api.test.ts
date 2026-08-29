import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";

describe("GET /api/tickets — My Tickets (Lab 2 Issue 9)", () => {
  const prisma = getPrisma();
  let requesterA: { id: number };
  let requesterB: { id: number };
  let category: { id: number };
  let relatedSystem: { id: number };

  beforeAll(async () => {
    // Clean up any existing test data
    await prisma.ticket.deleteMany({});
    await prisma.attachment.deleteMany({});

    // Create test categories and systems
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

    // Create two active requesters
    const reqA = await prisma.developmentRequester.upsert({
      where: { email: "requesterA@test.com" },
      update: {},
      create: { name: "Requester A", email: "requesterA@test.com", isActive: true },
    });
    requesterA = { id: reqA.id };

    const reqB = await prisma.developmentRequester.upsert({
      where: { email: "requesterB@test.com" },
      update: {},
      create: { name: "Requester B", email: "requesterB@test.com", isActive: true },
    });
    requesterB = { id: reqB.id };

    // Create test tickets
    await prisma.ticket.createMany({
      data: [
        {
          ticketNumber: "2608-0001",
          requesterId: requesterA.id,
          categoryId: category.id,
          relatedSystemId: relatedSystem.id,
          summary: "Laptop battery drains quickly",
          description: "Battery drains within 2 hours of normal use",
          requestedPriority: "HIGH",
          currentStatus: "NEW",
          ticketDate: new Date("2026-08-20T10:00:00Z"),
          createdAt: new Date("2026-08-20T10:00:00Z"),
          updatedAt: new Date("2026-08-20T10:00:00Z"),
        },
        {
          ticketNumber: "2608-0002",
          requesterId: requesterA.id,
          categoryId: category.id,
          relatedSystemId: (await prisma.relatedSystem.findFirstOrThrow({ where: { name: "Email" } })).id,
          summary: "Cannot connect to VPN",
          description: "VPN connection fails with timeout error",
          requestedPriority: "CRITICAL",
          currentStatus: "NEW",
          ticketDate: new Date("2026-08-21T10:00:00Z"),
          createdAt: new Date("2026-08-21T10:00:00Z"),
          updatedAt: new Date("2026-08-21T10:00:00Z"),
        },
        {
          ticketNumber: "2608-0003",
          requesterId: requesterB.id,
          categoryId: category.id,
          relatedSystemId: relatedSystem.id,
          summary: "Printer not working",
          description: "Printer shows paper jam error",
          requestedPriority: "MEDIUM",
          currentStatus: "NEW",
          ticketDate: new Date("2026-08-22T10:00:00Z"),
          createdAt: new Date("2026-08-22T10:00:00Z"),
          updatedAt: new Date("2026-08-22T10:00:00Z"),
        },
      ],
    });
  });

  afterAll(async () => {
    await prisma.ticket.deleteMany({});
    await prisma.attachment.deleteMany({});
    await prisma.developmentRequester.deleteMany({
      where: { email: { in: ["requesterA@test.com", "requesterB@test.com"] } },
    });
  });

  describe("Ownership enforcement (AC-11)", () => {
    it("should return only requester's own tickets (API-08)", async () => {
      const res = await request(app)
        .get(`/api/tickets?requesterId=${requesterA.id}`)
        .expect(200);

      expect(res.body.data).toHaveLength(2);
      expect(res.body.data.every((t: any) => t.requester?.id === requesterA.id)).toBe(true);
      expect(res.body.meta.totalCount).toBe(2);
    });

    it("should not return other requester's tickets (AC-11)", async () => {
      const res = await request(app)
        .get(`/api/tickets?requesterId=${requesterB.id}`)
        .expect(200);

      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].requester?.id).toBe(requesterB.id);
      expect(res.body.data.every((t: any) => t.requester?.id === requesterB.id)).toBe(true);
    });
  });

  describe("Search (AC-12)", () => {
    it("should find tickets by summary case-insensitive (AC-12, API-09)", async () => {
      const res = await request(app)
        .get(`/api/tickets?requesterId=${requesterA.id}&search=battery`)
        .expect(200);

      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].summary.toLowerCase()).toContain("battery");
    });

    it("should find tickets by description case-insensitive (AC-12)", async () => {
      const res = await request(app)
        .get(`/api/tickets?requesterId=${requesterA.id}&search=vpn`)
        .expect(200);

      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].description.toLowerCase()).toContain("vpn");
    });

    it("should return 400 for whitespace-only search (AC-12)", async () => {
      const res = await request(app)
        .get(`/api/tickets?requesterId=${requesterA.id}&search=   `)
        .expect(400);

      expect(res.body.error.code).toBe("VALIDATION_FAILED");
      expect(res.body.fieldErrors.search).toBeDefined();
    });
  });

  describe("Filtering (AC-13)", () => {
    it("should filter by categoryId (AC-13, API-10)", async () => {
      const res = await request(app)
        .get(`/api/tickets?requesterId=${requesterA.id}&categoryId=9999`)
        .expect(400);

      expect(res.body.error.code).toBe("VALIDATION_FAILED");
    });

    it("should filter by requestedPriority (AC-13, API-10)", async () => {
      const res = await request(app)
        .get(`/api/tickets?requesterId=${requesterA.id}&requestedPriority=CRITICAL`)
        .expect(200);

      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].requestedPriority).toBe("CRITICAL");
    });
  });

  describe("Sorting (AC-14, BR-21)", () => {
    it("should sort by updatedAt DESC by default (AC-14, API-11)", async () => {
      const res = await request(app)
        .get(`/api/tickets?requesterId=${requesterA.id}`)
        .expect(200);

      const timestamps = res.body.data.map((t: any) => new Date(t.updatedAt).getTime());
      for (let i = 0; i < timestamps.length - 1; i++) {
        expect(timestamps[i]).toBeGreaterThanOrEqual(timestamps[i + 1]);
      }
    });

    it("should sort by requestedPriority with custom rank (AC-14, BR-21)", async () => {
      const res = await request(app)
        .get(`/api/tickets?requesterId=${requesterA.id}&sort=requestedPriority&order=asc`)
        .expect(200);

      const priorities = res.body.data.map((t: any) => t.requestedPriority);
      expect(priorities).toEqual(["HIGH", "CRITICAL"]); // LOW=1, MEDIUM=2, HIGH=3, CRITICAL=4
    });
  });

  describe("Pagination (AC-15)", () => {
    it("should paginate with page and pageSize (AC-15, API-12)", async () => {
      const res = await request(app)
        .get(`/api/tickets?requesterId=${requesterA.id}&page=1&pageSize=10`)
        .expect(200);

      expect(res.body.data).toHaveLength(2);
      expect(res.body.meta).toEqual(
        expect.objectContaining({
          page: 1,
          pageSize: 10,
          totalCount: 2,
          totalPages: 1,
          hasNextPage: false,
          hasPreviousPage: false,
        })
      );
    });

    it("should return empty data with valid meta when page > totalPages (AC-15)", async () => {
      const res = await request(app)
        .get(`/api/tickets?requesterId=${requesterA.id}&page=10&pageSize=10`)
        .expect(200);

      expect(res.body.data).toHaveLength(0);
      expect(res.body.meta.totalCount).toBe(2);
      expect(res.body.meta.page).toBe(10);
      expect(res.body.meta.totalPages).toBe(1);
    });
  });

  describe("Strict query contract (AC-16)", () => {
    it("should return 400 for unknown parameter (AC-16, API-13)", async () => {
      const res = await request(app)
        .get(`/api/tickets?requesterId=1&unknownParam=foo`)
        .expect(400);

      expect(res.body.error.code).toBe("VALIDATION_FAILED");
      expect(res.body.fieldErrors.unknownParam).toBeDefined();
    });

    it("should return 400 for invalid page (AC-16)", async () => {
      const res = await request(app)
        .get(`/api/tickets?requesterId=1&page=0`)
        .expect(400);

      expect(res.body.fieldErrors.page).toBeDefined();
    });

    it("should return 400 for invalid pageSize (AC-16)", async () => {
      const res = await request(app)
        .get(`/api/tickets?requesterId=1&pageSize=15`)
        .expect(400);

      expect(res.body.fieldErrors.pageSize).toBeDefined();
    });

    it("should return 400 for invalid sort field (AC-16)", async () => {
      const res = await request(app)
        .get(`/api/tickets?requesterId=1&sort=invalid`)
        .expect(400);

      expect(res.body.fieldErrors.sort).toBeDefined();
    });

    it("should return 400 for invalid order (AC-16)", async () => {
      const res = await request(app)
        .get(`/api/tickets?requesterId=1&order=invalid`)
        .expect(400);

      expect(res.body.fieldErrors.order).toBeDefined();
    });

    it("should return 400 for invalid priority value", async () => {
      const res = await request(app)
        .get(`/api/tickets?requesterId=1&requestedPriority=INVALID`)
        .expect(400);

      expect(res.body.fieldErrors.requestedPriority).toBeDefined();
    });
  });

  describe("Ownership and access control", () => {
    it("should return 400 for missing requesterId", async () => {
      const res = await request(app)
        .get(`/api/tickets`)
        .expect(400);

      expect(res.body.fieldErrors.requesterId).toBeDefined();
    });

    it("should return 400 for inactive requesterId", async () => {
      // Create inactive requester
      const inactive = await getPrisma().developmentRequester.upsert({
        where: { email: "inactive2@test.com" },
        update: { isActive: false },
        create: { name: "Inactive", email: "inactive2@test.com", isActive: false },
      });

      const res = await request(app)
        .get(`/api/tickets?requesterId=${inactive.id}`)
        .expect(400);

      expect(res.body.fieldErrors.requesterId).toBeDefined();
    });
  });
});