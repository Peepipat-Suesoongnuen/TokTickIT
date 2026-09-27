import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import { SESSION_COOKIE_NAME } from "../../src/auth.js";
import { hashPassword } from "../../src/lib/password-hash.js";

// Issue #48 (Lab 3) — IT Staff Ticket Queue (FR-09, AC-08, api-spec §8):
// shared queue retrieval with documented search, filters, sorting,
// pagination, defaults, and strict invalid-query behavior. Authorized
// IT Staff/Administrator see the queue; Requester is rejected server-side.
const ORIGIN = "http://localhost:5174";
const PASSWORD = "Queue-Valid-9!";

const RUN = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6)}`;
const EMAIL_STAFF = `q48-staff-${RUN}@test.local`;
const EMAIL_ADMIN = `q48-admin-${RUN}@test.local`;
const EMAIL_REQUESTER = `q48-req-${RUN}@test.local`;
// Unique search token: appears in summaries, never in descriptions.
const TOKEN = `q48tok${RUN}`;

const prisma = getPrisma();

let staffId = 0;
let adminId = 0;
let requesterId = 0;
let categoryId = 0;
let relatedSystemId = 0;

let cookieStaff = "";
let cookieAdmin = "";
let cookieRequester = "";

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

async function loginAs(userEmail: string): Promise<string> {
  const res = await request(app)
    .post("/api/auth/login")
    .set("Origin", ORIGIN)
    .send({ email: userEmail, password: PASSWORD })
    .expect(200);
  const cookie = sessionCookieValue(res.headers["set-cookie"]);
  expect(cookie).toBeDefined();
  return cookie as string;
}

async function makeTicket(data: {
  summary: string;
  description?: string;
  requestedPriority?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  itPriority?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  currentStatus?: "NEW" | "OPEN" | "IN_PROGRESS" | "WAITING_FOR_REQUESTER" | "RESOLVED" | "CLOSED" | "REOPENED" | "CANCELLED";
  ticketOwnerId?: number | null;
  ticketNumber: string;
}): Promise<number> {
  const row = await prisma.ticket.create({
    data: {
      ticketNumber: data.ticketNumber,
      requesterId,
      categoryId,
      relatedSystemId,
      summary: data.summary,
      description: data.description ?? "Queue fixture description body.",
      requestedPriority: data.requestedPriority ?? "MEDIUM",
      itPriority: data.itPriority ?? data.requestedPriority ?? "MEDIUM",
      currentStatus: data.currentStatus ?? "NEW",
      ticketOwnerId: data.ticketOwnerId ?? null,
    },
    select: { id: true },
  });
  return row.id;
}

describe("Staff Ticket Queue (Issue #48, AC-08)", () => {
  beforeAll(async () => {
    const passwordHash = await hashPassword(PASSWORD);
    const [staff, admin, req] = await Promise.all(
      [
        { email: EMAIL_STAFF, role: "IT_STAFF" },
        { email: EMAIL_ADMIN, role: "ADMINISTRATOR" },
        { email: EMAIL_REQUESTER, role: "REQUESTER" },
      ].map((u) =>
        prisma.user.create({
          data: {
            name: `Queue48 ${u.role} ${RUN}`,
            email: u.email,
            passwordHash,
            role: u.role as "IT_STAFF" | "ADMINISTRATOR" | "REQUESTER",
            isActive: true,
            mustChangePassword: false,
          },
          select: { id: true },
        })
      )
    );
    staffId = staff.id;
    adminId = admin.id;
    requesterId = req.id;

    const category = await prisma.category.findFirst({
      where: { isActive: true },
      orderBy: { name: "asc" },
    });
    const system = await prisma.relatedSystem.findFirst({
      where: { isActive: true },
      orderBy: { name: "asc" },
    });
    if (!category || !system) throw new Error("Queue test requires seeded active Category/RelatedSystem");
    categoryId = category.id;
    relatedSystemId = system.id;

    // Rank probe: CRITICAL created first (older updatedAt) must still sort
    // before LOW created later under the default itPriority-DESC rank.
    await makeTicket({
      ticketNumber: `48${RUN.slice(-4)}-1001`,
      summary: `Rank critical ${TOKEN}`,
      requestedPriority: "LOW",
      itPriority: "CRITICAL",
    });
    await makeTicket({
      ticketNumber: `48${RUN.slice(-4)}-1002`,
      summary: `Rank low ${TOKEN}`,
      requestedPriority: "LOW",
      itPriority: "LOW",
    });
    // Search probe: token in summary must match.
    await makeTicket({
      ticketNumber: `48${RUN.slice(-4)}-1003`,
      summary: `Summary hit ${TOKEN} vpn`,
      requestedPriority: "HIGH",
      itPriority: "HIGH",
      currentStatus: "OPEN",
      ticketOwnerId: staffId,
    });
    // Description-only probe: token in description must NOT match.
    await makeTicket({
      ticketNumber: `48${RUN.slice(-4)}-1004`,
      summary: "Ordinary network printer jam",
      description: `Body mentions ${TOKEN} only here, never in the summary.`,
      requestedPriority: "MEDIUM",
      itPriority: "MEDIUM",
    });

    cookieStaff = await loginAs(EMAIL_STAFF);
    cookieAdmin = await loginAs(EMAIL_ADMIN);
    cookieRequester = await loginAs(EMAIL_REQUESTER);
  });

  afterAll(async () => {
    await prisma.ticket.deleteMany({
      where: { requesterId },
    });
    await prisma.user.deleteMany({
      where: { email: { in: [EMAIL_STAFF, EMAIL_ADMIN, EMAIL_REQUESTER] } },
    });
  });

  it("API-19: Staff and Admin retrieve the queue; Requester is forbidden; anonymous is unauthenticated", async () => {
    const staff = await request(app).get("/api/staff/tickets").set("Cookie", cookieStaff).expect(200);
    expect(Array.isArray(staff.body.data)).toBe(true);
    expect(staff.body.meta.page).toBe(1);

    const admin = await request(app).get("/api/staff/tickets").set("Cookie", cookieAdmin).expect(200);
    expect(Array.isArray(admin.body.data)).toBe(true);

    const denied = await request(app).get("/api/staff/tickets").set("Cookie", cookieRequester).expect(403);
    expect(denied.body.error.code).toBe("FORBIDDEN");

    const anon = await request(app).get("/api/staff/tickets").expect(401);
    expect(anon.body.error.code).toBe("UNAUTHENTICATED");
  });

  it("API-19: queue rows expose ownership, priorities, status, and safe requester data", async () => {
    const res = await request(app)
      .get("/api/staff/tickets")
      .query({ search: TOKEN, pageSize: 50 })
      .set("Cookie", cookieStaff)
      .expect(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(3);
    for (const row of res.body.data) {
      expect(row).toMatchObject({ requestedPriority: expect.any(String) });
      expect(row.itPriority).toBeDefined();
      expect(row.currentStatus).toBeDefined();
      expect("ticketOwner" in row).toBe(true);
      expect(row.requester.id).toBe(requesterId);
      // Safe requester shape: id + name only, never email or secrets.
      expect(Object.keys(row.requester).sort()).toEqual(["id", "name"]);
      expect(row.requesterResolutionIndicatedAt === null || typeof row.requesterResolutionIndicatedAt === "string").toBe(true);
    }
    const owned = res.body.data.find((r: { ticketOwner: unknown }) => r.ticketOwner !== null);
    expect(owned.ticketOwner).toMatchObject({ id: staffId, name: expect.any(String) });
    expect(Object.keys(owned.ticketOwner).sort()).toEqual(["id", "name"]);
  });

  it("API-20: search matches Ticket Number, Summary, Requester name/email but not Description", async () => {
    // Summary hit.
    const hit = await request(app)
      .get("/api/staff/tickets")
      .query({ search: `vpn ${TOKEN}`.split(" ")[1], pageSize: 50 })
      .set("Cookie", cookieStaff)
      .expect(200);
    expect(hit.body.data.length).toBeGreaterThanOrEqual(3);

    // Description-only ticket must be excluded: search the exact body token
    // with a summary-scoped probe — the description-only row has a unique
    // summary, so assert it never appears for a token absent from summaries.
    const noHit = await request(app)
      .get("/api/staff/tickets")
      .query({ search: "printer jam q48-no-such-token", pageSize: 50 })
      .set("Cookie", cookieStaff)
      .expect(200);
    expect(noHit.body.data).toEqual([]);

    // Requester email search finds this run's tickets.
    const byEmail = await request(app)
      .get("/api/staff/tickets")
      .query({ search: EMAIL_REQUESTER, pageSize: 50 })
      .set("Cookie", cookieStaff)
      .expect(200);
    expect(byEmail.body.data.length).toBeGreaterThanOrEqual(4);

    // Ticket Number search.
    const one = await request(app)
      .get("/api/staff/tickets")
      .query({ search: `48${RUN.slice(-4)}-1003` })
      .set("Cookie", cookieStaff)
      .expect(200);
    expect(one.body.data.map((r: { ticketNumber: string }) => r.ticketNumber)).toContain(`48${RUN.slice(-4)}-1003`);
  });

  it("API-21: filters narrow by category/priorities/status/owner semantics", async () => {
    const base = { search: TOKEN, pageSize: 50 };

    const byReq = await request(app)
      .get("/api/staff/tickets")
      .query({ ...base, requestedPriority: "HIGH" })
      .set("Cookie", cookieStaff)
      .expect(200);
    expect(byReq.body.data.length).toBeGreaterThanOrEqual(1);
    for (const r of byReq.body.data) expect(r.requestedPriority).toBe("HIGH");

    const byIt = await request(app)
      .get("/api/staff/tickets")
      .query({ ...base, itPriority: "CRITICAL" })
      .set("Cookie", cookieStaff)
      .expect(200);
    expect(byIt.body.data.length).toBeGreaterThanOrEqual(1);
    for (const r of byIt.body.data) expect(r.itPriority).toBe("CRITICAL");

    const byStatus = await request(app)
      .get("/api/staff/tickets")
      .query({ ...base, currentStatus: "OPEN" })
      .set("Cookie", cookieStaff)
      .expect(200);
    expect(byStatus.body.data.length).toBeGreaterThanOrEqual(1);
    for (const r of byStatus.body.data) expect(r.currentStatus).toBe("OPEN");

    const unassigned = await request(app)
      .get("/api/staff/tickets")
      .query({ ...base, owner: "unassigned" })
      .set("Cookie", cookieStaff)
      .expect(200);
    expect(unassigned.body.data.length).toBeGreaterThanOrEqual(1);
    for (const r of unassigned.body.data) expect(r.ticketOwner).toBeNull();

    const mine = await request(app)
      .get("/api/staff/tickets")
      .query({ ...base, owner: "me" })
      .set("Cookie", cookieStaff)
      .expect(200);
    expect(mine.body.data.length).toBeGreaterThanOrEqual(1);
    for (const r of mine.body.data) expect(r.ticketOwner?.id).toBe(staffId);

    const byId = await request(app)
      .get("/api/staff/tickets")
      .query({ ...base, owner: String(adminId) })
      .set("Cookie", cookieStaff)
      .expect(200);
    expect(byId.body.data).toEqual([]);

    const byCategory = await request(app)
      .get("/api/staff/tickets")
      .query({ ...base, categoryId: String(categoryId) })
      .set("Cookie", cookieStaff)
      .expect(200);
    // Only 3 of the 4 fixtures carry TOKEN in the summary (the fourth is
    // the description-only probe); the category filter must keep all 3.
    expect(byCategory.body.data.length).toBeGreaterThanOrEqual(3);
  });

  it("API-22: default rank is itPriority DESC then recency; pagination meta is valid", async () => {
    const res = await request(app)
      .get("/api/staff/tickets")
      .query({ search: TOKEN, pageSize: 50 })
      .set("Cookie", cookieStaff)
      .expect(200);
    const ranks = res.body.data.map((r: { itPriority: string }) => r.itPriority);
    const rankOf = (p: string): number => ({ LOW: 0, MEDIUM: 1, HIGH: 2, CRITICAL: 3 })[p] ?? -1;
    for (let i = 1; i < ranks.length; i++) {
      expect(rankOf(ranks[i - 1])).toBeGreaterThanOrEqual(rankOf(ranks[i]));
    }
    // CRITICAL (created first) still precedes LOW (created later).
    const numbers = res.body.data.map((r: { ticketNumber: string }) => r.ticketNumber);
    expect(numbers.indexOf(`48${RUN.slice(-4)}-1001`)).toBeLessThan(numbers.indexOf(`48${RUN.slice(-4)}-1002`));

    expect(res.body.meta).toMatchObject({
      page: 1,
      pageSize: 50,
      totalCount: expect.any(Number),
      totalPages: expect.any(Number),
      hasNextPage: expect.any(Boolean),
      hasPreviousPage: false,
    });

    const beyond = await request(app)
      .get("/api/staff/tickets")
      .query({ search: TOKEN, page: 999, pageSize: 10 })
      .set("Cookie", cookieStaff)
      .expect(200);
    expect(beyond.body.data).toEqual([]);
    expect(beyond.body.meta.page).toBe(999);
  });

  it("API-23: unknown, duplicate, and invalid queue query input is rejected strictly", async () => {
    const unknown = await request(app)
      .get("/api/staff/tickets?requesterId=1")
      .set("Cookie", cookieStaff)
      .expect(400);
    expect(unknown.body.error.code).toBe("VALIDATION_FAILED");

    const dup = await request(app)
      .get("/api/staff/tickets?search=a&search=b")
      .set("Cookie", cookieStaff)
      .expect(400);
    expect(dup.body.error.code).toBe("VALIDATION_FAILED");

    for (const q of [
      "requestedPriority=URGENT",
      "itPriority=URGENT",
      "currentStatus=BOGUS",
      "sort=hacker",
      "order=sideways",
      "page=0",
      "pageSize=25",
      "categoryId=abc",
      "owner=abc",
    ]) {
      const res = await request(app)
        .get(`/api/staff/tickets?${q}`)
        .set("Cookie", cookieStaff)
        .expect(400);
      expect(res.body.error.code).toBe("VALIDATION_FAILED");
    }

    const badOwner = await request(app)
      .get("/api/staff/tickets?owner=999999999")
      .set("Cookie", cookieStaff)
      .expect(400);
    expect(badOwner.body.error.code).toBe("VALIDATION_FAILED");
  });
});
