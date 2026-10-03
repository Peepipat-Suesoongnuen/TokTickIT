import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import { hashPassword } from "../../src/lib/password-hash.js";
import { loginAs, TEST_ORIGIN } from "../helpers/auth-test.js";

// Issue #80 (Lab 4) — Requester dashboard (LAP4-06).
// Covers API-21, SEC-02 with namespaced fixtures.
const PASSWORD = "Lab4-DashReq-80!";
const RUN = `a80r-${Date.now().toString(36)}`;

const prisma = getPrisma();
let reqA = 0;
let reqB = 0;
let staffId = 0;
let categoryId = 0;
let relatedSystemId = 0;
let cookieA = "";
let cookieB = "";
let cookieStaff = "";

let ticketSeq = 0;
async function makeTicket(
  requester: number,
  overrides: {
    currentStatus?: "NEW" | "OPEN" | "IN_PROGRESS" | "WAITING_FOR_REQUESTER" | "RESOLVED" | "CLOSED";
    updatedAt?: Date;
  } = {},
): Promise<number> {
  ticketSeq += 1;
  const row = await prisma.ticket.create({
    data: {
      ticketNumber: `80${RUN.slice(-6)}-${String(1000 + ticketSeq)}`,
      requesterId: requester,
      categoryId,
      relatedSystemId,
      summary: `Dashboard fixture ${RUN} #${ticketSeq}`,
      description: "Dashboard fixture description body.",
      requestedPriority: "MEDIUM",
      itPriority: "MEDIUM",
      currentStatus: overrides.currentStatus ?? "OPEN",
      ticketOwnerId: null,
      ...(overrides.updatedAt ? { updatedAt: overrides.updatedAt } : {}),
    },
    select: { id: true },
  });
  return row.id;
}

async function makeUser(email: string, role: "REQUESTER" | "IT_STAFF" | "ADMINISTRATOR") {
  const passwordHash = await hashPassword(PASSWORD);
  return prisma.user.create({
    data: { name: email, email, passwordHash, role, isActive: true, mustChangePassword: false, failedLoginAttempts: 0 },
    select: { id: true },
  });
}

beforeAll(async () => {
  reqA = (await makeUser(`a80r-a-${RUN}@test.local`, "REQUESTER")).id;
  reqB = (await makeUser(`a80r-b-${RUN}@test.local`, "REQUESTER")).id;
  staffId = (await makeUser(`a80r-staff-${RUN}@test.local`, "IT_STAFF")).id;
  const cat = await prisma.category.create({ data: { name: `A80R Cat ${RUN}`, isActive: true } });
  const sys = await prisma.relatedSystem.create({ data: { name: `A80R Sys ${RUN}`, isActive: true } });
  categoryId = cat.id;
  relatedSystemId = sys.id;
  cookieA = await loginAs(`a80r-a-${RUN}@test.local`, PASSWORD);
  cookieB = await loginAs(`a80r-b-${RUN}@test.local`, PASSWORD);
  cookieStaff = await loginAs(`a80r-staff-${RUN}@test.local`, PASSWORD);
  void staffId;
});

describe("Requester dashboard (Issue #80, LAP4-06)", () => {
  it("API-21 requester metrics and recents are owned-only with exact links", async () => {
    const base = Date.now();
    // 8 owned tickets with staggered recency for top-5 truncation proof.
    const specs = [
      { status: "OPEN", ageMin: 70 },
      { status: "OPEN", ageMin: 60 },
      { status: "WAITING_FOR_REQUESTER", ageMin: 50 },
      { status: "RESOLVED", ageMin: 40 },
      { status: "RESOLVED", ageMin: 30 },
      { status: "CLOSED", ageMin: 20 },
      { status: "NEW", ageMin: 10 },
      { status: "OPEN", ageMin: 5 },
    ] as const;
    for (const s of specs) {
      await makeTicket(reqA, {
        currentStatus: s.status as "OPEN",
        updatedAt: new Date(base - s.ageMin * 60_000),
      });
    }
    // Foreign ticket that must never leak in.
    await makeTicket(reqB, { currentStatus: "OPEN" });
    const res = await request(app)
      .get("/api/dashboard/requester")
      .set("Origin", TEST_ORIGIN)
      .set("Cookie", cookieA)
      .expect(200);
    // openTickets counts owned non-terminal (NEW/OPEN×3/WAITING).
    expect(res.body.metrics).toMatchObject({ openTickets: 5, waitingForRequester: 1 });
    // recentlyUpdated: owned non-terminal top 5, updatedAt DESC, id DESC.
    expect(res.body.recentlyUpdated).toHaveLength(5);
    const stamps = res.body.recentlyUpdated.map((t: { updatedAt: string }) => t.updatedAt);
    expect([...stamps].sort().reverse()).toEqual(stamps);
    // Most recent first: the 5-minute OPEN ticket heads the list; the
    // 70-minute one falls off (top-5 truncation).
    expect(new Date(stamps[0]).getTime()).toBeGreaterThan(new Date(stamps[4]).getTime());
    // recentlyResolved: owned RESOLVED/CLOSED top 5 (only 3 exist).
    expect(res.body.recentlyResolved).toHaveLength(3);
    for (const t of res.body.recentlyResolved) {
      expect(["RESOLVED", "CLOSED"]).toContain(t.currentStatus);
    }
    // Exact drill-down links per contract.
    expect(res.body.links).toEqual({
      openTickets: "/my-tickets?state=open",
      waitingForRequester: "/my-tickets?status=WAITING_FOR_REQUESTER",
      recentlyResolved: "/my-tickets?state=resolved",
    });
    // Row shape: exact contract fields per list item.
    for (const t of [...res.body.recentlyUpdated, ...res.body.recentlyResolved]) {
      expect(Object.keys(t).sort()).toEqual(["currentStatus", "id", "summary", "ticketNumber", "updatedAt"]);
    }
  });

  it("API-21 zero-ticket requester gets zeros and empty lists, never 404", async () => {
    const fresh = await makeUser(`a80r-fresh-${RUN}@test.local`, "REQUESTER");
    void fresh;
    const cookieFresh = await loginAs(`a80r-fresh-${RUN}@test.local`, PASSWORD);
    const res = await request(app)
      .get("/api/dashboard/requester")
      .set("Origin", TEST_ORIGIN)
      .set("Cookie", cookieFresh)
      .expect(200);
    expect(res.body.metrics).toEqual({ openTickets: 0, waitingForRequester: 0 });
    expect(res.body.recentlyUpdated).toEqual([]);
    expect(res.body.recentlyResolved).toEqual([]);
  });

  it("API-21 malformed auth is rejected without leakage", async () => {
    await request(app).get("/api/dashboard/requester").set("Origin", TEST_ORIGIN).expect(401);
    await request(app)
      .get("/api/dashboard/requester")
      .set("Origin", TEST_ORIGIN)
      .set("Cookie", cookieStaff)
      .expect(403);
  });

  it("SEC-02 cross-requester dashboard access leaks nothing", async () => {
    const res = await request(app)
      .get("/api/dashboard/requester")
      .set("Origin", TEST_ORIGIN)
      .set("Cookie", cookieB)
      .expect(200);
    // Every ticket number in B's view must belong to B (DB cross-check).
    const bNumbers = (
      await prisma.ticket.findMany({ where: { requesterId: reqB }, select: { ticketNumber: true } })
    ).map((t) => t.ticketNumber);
    const seen: string[] = [];
    for (const t of [...res.body.recentlyUpdated, ...res.body.recentlyResolved]) {
      expect(bNumbers).toContain(t.ticketNumber);
      seen.push(t.ticketNumber);
    }
    // B owns exactly the one foreign fixture ticket.
    expect(bNumbers).toHaveLength(1);
    expect(seen).toEqual(bNumbers);
    expect(res.body.metrics).toEqual({ openTickets: 1, waitingForRequester: 0 });
  });
});

afterAll(async () => {
  const prefix = `80${RUN.slice(-6)}-`;
  await prisma.ticket.deleteMany({ where: { ticketNumber: { startsWith: prefix } } });
  await prisma.session.deleteMany({ where: { user: { email: { endsWith: `${RUN}@test.local` } } } });
  await prisma.user.deleteMany({ where: { email: { endsWith: `${RUN}@test.local` } } });
  await prisma.category.deleteMany({ where: { name: `A80R Cat ${RUN}` } });
  await prisma.relatedSystem.deleteMany({ where: { name: `A80R Sys ${RUN}` } });
});
