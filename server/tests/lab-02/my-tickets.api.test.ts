import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import { hashPassword } from "../../src/lib/password-hash.js";
import { loginAs } from "../helpers/auth-test.js";

describe("GET /api/tickets — My Tickets (Lab 2 Issue 9)", () => {
  const prisma = getPrisma();
  // Issue #46 (Lab 3): session-derived ownership — fixtures are real loginable
  // Users; every request carries the session cookie, no requesterId is sent.
  const emailA = "lab2-mytickets-a@example.com";
  const emailB = "lab2-mytickets-b@example.com";
  const password = "Lab2-Heal-Valid-9!";
  let requesterA: { id: number };
  let requesterB: { id: number };
  let cookieA: string;
  let cookieB: string;
  let category: { id: number };
  let relatedSystem: { id: number };
  const INACTIVE_EMAIL = "lab2-inactive-mytickets@example.com";

  beforeAll(async () => {
    // Isolated fixture: clean only this suite's data (by unique ticketNumbers/emails)
    await prisma.ticket.deleteMany({ where: { ticketNumber: { in: ["2608-0001", "2608-0002", "2608-0003"] } } });

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

    // Create two active requesters (loginable Users)
    const passwordHash = await hashPassword(password);
    await prisma.user.deleteMany({ where: { email: { in: [emailA, emailB] } } });
    const [userA, userB] = await Promise.all(
      [
        { name: "Requester A", email: emailA },
        { name: "Requester B", email: emailB },
      ].map((u) =>
        prisma.user.create({
          data: {
            name: u.name,
            email: u.email,
            passwordHash,
            role: "REQUESTER",
            isActive: true,
            mustChangePassword: false,
          },
          select: { id: true },
        })
      )
    );
    requesterA = { id: userA.id };
    requesterB = { id: userB.id };
    cookieA = await loginAs(emailA, password);
    cookieB = await loginAs(emailB, password);

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
          itPriority: "HIGH",
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
          itPriority: "CRITICAL",
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
          itPriority: "MEDIUM",
          currentStatus: "NEW",
          ticketDate: new Date("2026-08-22T10:00:00Z"),
          createdAt: new Date("2026-08-22T10:00:00Z"),
          updatedAt: new Date("2026-08-22T10:00:00Z"),
        },
      ],
    });
  });

  afterAll(async () => {
    await prisma.ticket.deleteMany({ where: { ticketNumber: { in: ["2608-0001", "2608-0002", "2608-0003"] } } });
    await prisma.user.deleteMany({
      where: { email: { in: [emailA, emailB, INACTIVE_EMAIL] } },
    });
  });

  describe("Ownership enforcement (AC-11)", () => {
    it("should return only requester's own tickets (API-08)", async () => {
      const res = await request(app)
        .get(`/api/tickets`)
        .set("Cookie", cookieA)
        .expect(200);

      expect(res.body.data).toHaveLength(2);
      expect(res.body.data.every((t: any) => t.requester?.id === requesterA.id)).toBe(true);
      expect(res.body.meta.totalCount).toBe(2);
    });

    it("should not return other requester's tickets (AC-11)", async () => {
      const res = await request(app)
        .get(`/api/tickets`)
        .set("Cookie", cookieB)
        .expect(200);

      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].requester?.id).toBe(requesterB.id);
      expect(res.body.data.every((t: any) => t.requester?.id === requesterB.id)).toBe(true);
    });

    it("should include official ticketDate in My Tickets list items (Issue 12C)", async () => {
      const res = await request(app)
        .get(`/api/tickets?sort=ticketNumber&order=asc`)
        .set("Cookie", cookieA)
        .expect(200);

      expect(res.body.data).toHaveLength(2);
      for (const item of res.body.data as Array<{ ticketDate?: unknown }>) {
        expect(typeof item.ticketDate).toBe("string");
        expect(item.ticketDate).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/);
        expect(Number.isFinite(Date.parse(item.ticketDate as string))).toBe(true);
      }
      expect(res.body.data[0]).toEqual(
        expect.objectContaining({
          ticketNumber: "2608-0001",
          ticketDate: "2026-08-20T10:00:00.000Z",
        })
      );
      expect(res.body.data[1]).toEqual(
        expect.objectContaining({
          ticketNumber: "2608-0002",
          ticketDate: "2026-08-21T10:00:00.000Z",
        })
      );
    });
  });

  describe("Search (AC-12)", () => {
    it("should find tickets by summary case-insensitive (AC-12, API-09)", async () => {
      const res = await request(app)
        .get(`/api/tickets?search=battery`)
        .set("Cookie", cookieA)
        .expect(200);

      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].summary.toLowerCase()).toContain("battery");
    });

    it("should find tickets by Ticket Number partial match (AC-12, API-09)", async () => {
      const res = await request(app)
        .get(`/api/tickets?search=0002`)
        .set("Cookie", cookieA)
        .expect(200);

      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].ticketNumber).toBe("2608-0002");
    });

    it("should not match a term that exists only in Description (AC-12, API-09)", async () => {
      const res = await request(app)
        .get(`/api/tickets?search=timeout`)
        .set("Cookie", cookieA)
        .expect(200);

      expect(res.body.data).toHaveLength(0);
      expect(res.body.meta.totalCount).toBe(0);
    });

    it("should return 400 for whitespace-only search (AC-12)", async () => {
      const res = await request(app)
        .get(`/api/tickets?search=   `)
        .set("Cookie", cookieA)
        .expect(400);

      expect(res.body.error.code).toBe("VALIDATION_FAILED");
      expect(res.body.fieldErrors.search).toBeDefined();
    });
  });

  describe("Filtering (AC-13)", () => {
    it("should filter by categoryId valid value (AC-13, API-10)", async () => {
      const res = await request(app)
        .get(`/api/tickets?categoryId=${category.id}`)
        .set("Cookie", cookieA)
        .expect(200);

      expect(res.body.data.length).toBeGreaterThan(0);
      expect(res.body.data.every((t: any) => t.category?.id === category.id)).toBe(true);
    });

    it("should return 400 for non-existent categoryId (AC-13, API-10)", async () => {
      const res = await request(app)
        .get(`/api/tickets?categoryId=9999`)
        .set("Cookie", cookieA)
        .expect(400);

      expect(res.body.error.code).toBe("VALIDATION_FAILED");
    });

    it("should return 400 for an inactive categoryId", async () => {
      const inactive = await prisma.category.upsert({
        where: { name: "Inactive My Tickets Category" },
        update: { isActive: false },
        create: { name: "Inactive My Tickets Category", isActive: false },
      });
      try {
        const res = await request(app)
          .get(`/api/tickets?categoryId=${inactive.id}`)
          .set("Cookie", cookieA)
          .expect(400);
        expect(res.body.error.code).toBe("VALIDATION_FAILED");
        expect(res.body.fieldErrors.categoryId).toBeDefined();
      } finally {
        await prisma.category.delete({ where: { id: inactive.id } });
      }
    });

    it("should filter by requestedPriority (AC-13, API-10)", async () => {
      const res = await request(app)
        .get(`/api/tickets?requestedPriority=CRITICAL`)
        .set("Cookie", cookieA)
        .expect(200);

      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].requestedPriority).toBe("CRITICAL");
    });

    it("should filter by currentStatus NEW (Issue 12C)", async () => {
      const res = await request(app)
        .get(`/api/tickets?currentStatus=NEW`)
        .set("Cookie", cookieA)
        .expect(200);

      expect(res.body.data).toHaveLength(2);
      expect(res.body.data.every((ticket: { currentStatus: string }) => ticket.currentStatus === "NEW")).toBe(true);
    });
  });

  describe("Sorting (AC-14, BR-21)", () => {
    it("should sort by updatedAt DESC by default (AC-14, API-11)", async () => {
      const res = await request(app)
        .get(`/api/tickets`)
        .set("Cookie", cookieA)
        .expect(200);

      const timestamps = res.body.data.map((t: any) => new Date(t.updatedAt).getTime());
      for (let i = 0; i < timestamps.length - 1; i++) {
        expect(timestamps[i]).toBeGreaterThanOrEqual(timestamps[i + 1]);
      }
    });

    it("should sort by requestedPriority with custom rank (AC-14, BR-21)", async () => {
      const res = await request(app)
        .get(`/api/tickets?sort=requestedPriority&order=asc`)
        .set("Cookie", cookieA)
        .expect(200);

      const priorities = res.body.data.map((t: any) => t.requestedPriority);
      expect(priorities).toEqual(["HIGH", "CRITICAL"]); // LOW=1, MEDIUM=2, HIGH=3, CRITICAL=4
    });

    it.each([
      ["asc", ["2608-0001", "2608-0002"]],
      ["desc", ["2608-0002", "2608-0001"]],
    ] as const)("should sort by Ticket Number %s (AC-14, API-11)", async (order, expected) => {
      const res = await request(app)
        .get(`/api/tickets?sort=ticketNumber&order=${order}`)
        .set("Cookie", cookieA)
        .expect(200);

      expect(res.body.data.map((ticket: { ticketNumber: string }) => ticket.ticketNumber)).toEqual(expected);
    });

    it.each(["updatedAt", "ticketDate"] as const)("should use id DESC when %s values tie", async (sortField) => {
      const tiedAt = new Date("2026-08-25T10:00:00Z");
      const created = await Promise.all(
        ["2699-9901", "2699-9902"].map((ticketNumber) =>
          prisma.ticket.create({
            data: {
              ticketNumber,
              requesterId: requesterA.id,
              categoryId: category.id,
              relatedSystemId: relatedSystem.id,
              summary: `Tie ${ticketNumber}`,
              description: "Deterministic secondary ordering fixture",
              requestedPriority: "LOW",
              itPriority: "LOW",
              currentStatus: "NEW",
              ticketDate: tiedAt,
              updatedAt: tiedAt,
            },
          })
        )
      );
      try {
        const res = await request(app)
          .get(`/api/tickets?sort=${sortField}&order=desc&pageSize=10`)
          .set("Cookie", cookieA)
          .expect(200);
        const tieIds = res.body.data
          .filter((ticket: { ticketNumber: string }) => ticket.ticketNumber.startsWith("2699-99"))
          .map((ticket: { id: number }) => ticket.id);
        expect(tieIds).toEqual(created.map((ticket) => ticket.id).sort((a, b) => b - a));
      } finally {
        await prisma.ticket.deleteMany({ where: { ticketNumber: { in: ["2699-9901", "2699-9902"] } } });
      }
    });

    it("should use id DESC when requestedPriority values tie", async () => {
      const tiedPriorityTicket = await prisma.ticket.create({
        data: {
          ticketNumber: "2699-9903",
          requesterId: requesterA.id,
          categoryId: category.id,
          relatedSystemId: relatedSystem.id,
          summary: "Priority tie fixture",
          description: "Deterministic priority secondary ordering fixture",
          requestedPriority: "HIGH",
          itPriority: "HIGH",
          currentStatus: "NEW",
        },
      });
      try {
        const res = await request(app)
          .get(`/api/tickets?sort=requestedPriority&order=asc`)
          .set("Cookie", cookieA)
          .expect(200);
        const highIds = res.body.data
          .filter((ticket: { requestedPriority: string }) => ticket.requestedPriority === "HIGH")
          .map((ticket: { id: number }) => ticket.id);
        expect(highIds).toHaveLength(2);
        expect(highIds).toEqual([...highIds].sort((a, b) => b - a));
      } finally {
        await prisma.ticket.delete({ where: { id: tiedPriorityTicket.id } });
      }
    });
  });

  describe("Pagination (AC-15)", () => {
    it("should paginate with page and pageSize (AC-15, API-12)", async () => {
      const res = await request(app)
        .get(`/api/tickets?page=1&pageSize=10`)
        .set("Cookie", cookieA)
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

    it.each([10, 20, 50])("should accept pageSize %i", async (pageSize) => {
      const res = await request(app)
        .get(`/api/tickets?page=1&pageSize=${pageSize}`)
        .set("Cookie", cookieA)
        .expect(200);
      expect(res.body.meta.pageSize).toBe(pageSize);
      expect(res.body.data).toHaveLength(2);
    });

    it("should return empty data with valid meta when page > totalPages (AC-15)", async () => {
      const res = await request(app)
        .get(`/api/tickets?page=10&pageSize=10`)
        .set("Cookie", cookieA)
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
        .get(`/api/tickets?unknownParam=foo`)
        .set("Cookie", cookieA)
        .expect(400);

      expect(res.body.error.code).toBe("VALIDATION_FAILED");
      expect(res.body.fieldErrors.unknownParam).toBeDefined();
    });

    it("should return 400 for invalid page (AC-16)", async () => {
      const res = await request(app)
        .get(`/api/tickets?page=0`)
        .set("Cookie", cookieA)
        .expect(400);

      expect(res.body.fieldErrors.page).toBeDefined();
    });

    it("should return 400 for invalid pageSize (AC-16)", async () => {
      const res = await request(app)
        .get(`/api/tickets?pageSize=15`)
        .set("Cookie", cookieA)
        .expect(400);

      expect(res.body.fieldErrors.pageSize).toBeDefined();
    });

    it("should return 400 for invalid sort field (AC-16)", async () => {
      const res = await request(app)
        .get(`/api/tickets?sort=invalid`)
        .set("Cookie", cookieA)
        .expect(400);

      expect(res.body.fieldErrors.sort).toBeDefined();
    });

    it("should return 400 for invalid order (AC-16)", async () => {
      const res = await request(app)
        .get(`/api/tickets?order=invalid`)
        .set("Cookie", cookieA)
        .expect(400);

      expect(res.body.fieldErrors.order).toBeDefined();
    });

    it("should return 400 for invalid priority value", async () => {
      const res = await request(app)
        .get(`/api/tickets?requestedPriority=INVALID`)
        .set("Cookie", cookieA)
        .expect(400);

      expect(res.body.fieldErrors.requestedPriority).toBeDefined();
    });

    it("should return 400 for invalid currentStatus value", async () => {
      const res = await request(app)
        .get(`/api/tickets?currentStatus=CLOSED`)
        .set("Cookie", cookieA)
        .expect(400);

      expect(res.body.fieldErrors.currentStatus).toBeDefined();
    });

    it("should return 400 for duplicate query param (AC-16)", async () => {
      const res = await request(app)
        .get(`/api/tickets?page=1&page=2`)
        .set("Cookie", cookieA)
        .expect(400);

      expect(res.body.fieldErrors.page).toBeDefined();
    });

    it("should return 400 for duplicate requesterId (AC-16)", async () => {
      const res = await request(app)
        .get(`/api/tickets?requesterId=${requesterA.id}&requesterId=${requesterB.id}`)
        .set("Cookie", cookieA)
        .expect(400);

      expect(res.body.fieldErrors.requesterId).toBeDefined();
    });

    it("should return 400 for unsafe integer requesterId (AC-16)", async () => {
      const res = await request(app)
        .get(`/api/tickets?requesterId=9007199254740992`)
        .set("Cookie", cookieA)
        .expect(400);

      expect(res.body.fieldErrors.requesterId).toBeDefined();
    });
  });

  describe("Ownership and access control", () => {
    it("should return own tickets without requesterId (session-derived owner)", async () => {
      const res = await request(app)
        .get(`/api/tickets`)
        .set("Cookie", cookieA)
        .expect(200);

      expect(res.body.data).toHaveLength(2);
      expect(res.body.data.every((t: any) => t.requester?.id === requesterA.id)).toBe(true);
      expect(res.body.meta.totalCount).toBe(2);
    });

    it("should return 400 for inactive requesterId", async () => {
      // Inactive user can never own the session — a client-supplied
      // requesterId is rejected as an unknown parameter either way.
      const passwordHash = await hashPassword(password);
      await prisma.user.deleteMany({ where: { email: INACTIVE_EMAIL } });
      const inactive = await prisma.user.create({
        data: {
          name: "Inactive",
          email: INACTIVE_EMAIL,
          passwordHash,
          role: "REQUESTER",
          isActive: false,
          mustChangePassword: false,
        },
      });

      try {
        const res = await request(app)
          .get(`/api/tickets?requesterId=${inactive.id}`)
          .set("Cookie", cookieA)
          .expect(400);

        expect(res.body.fieldErrors.requesterId).toBeDefined();
      } finally {
        await prisma.user.delete({ where: { id: inactive.id } });
      }
    });
  });

  describe("Safe server errors", () => {
    it("should return a safe 500 envelope when the ticket query fails", async () => {
      const countSpy = vi.spyOn(prisma.ticket, "count").mockRejectedValueOnce(new Error("SQL connection details"));
      try {
        const res = await request(app)
          .get(`/api/tickets`)
          .set("Cookie", cookieA)
          .expect(500);
        expect(res.body).toEqual({
          error: {
            code: "INTERNAL_ERROR",
            message: "An unexpected error occurred. Please try again.",
          },
        });
        expect(JSON.stringify(res.body)).not.toContain("SQL connection details");
      } finally {
        countSpy.mockRestore();
      }
    });
  });
});
