import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import { SESSION_COOKIE_NAME } from "../../src/auth.js";
import { hashPassword } from "../../src/lib/password-hash.js";

// Issue #48 (Lab 3) — SEC-06/SEC-01 boundary for the Staff workspace
// (AC-07/18, BR-55): every state-changing staff route enforces the exact
// approved-Origin policy BEFORE account/resource-specific processing, and
// the role matrix holds on mutating routes as well as reads.
const ORIGIN = "http://localhost:5174";
const PASSWORD = "StaffSec-Valid-9!";

const RUN = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6)}`;
const EMAIL_STAFF = `q48-sec-staff-${RUN}@test.local`;
const EMAIL_REQUESTER = `q48-sec-req-${RUN}@test.local`;

const prisma = getPrisma();

let staffId = 0;
let requesterId = 0;
let categoryId = 0;
let relatedSystemId = 0;
let ticketId = 0;
let cookieStaff = "";
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

describe("Staff workspace security boundary (Issue #48, SEC-01/06)", () => {
  beforeAll(async () => {
    const passwordHash = await hashPassword(PASSWORD);
    const [staff, req] = await Promise.all(
      [
        { email: EMAIL_STAFF, role: "IT_STAFF" },
        { email: EMAIL_REQUESTER, role: "REQUESTER" },
      ].map((u) =>
        prisma.user.create({
          data: {
            name: `SEC48 ${u.role} ${RUN}`,
            email: u.email,
            passwordHash,
            role: u.role as "IT_STAFF" | "REQUESTER",
            isActive: true,
            mustChangePassword: false,
          },
          select: { id: true },
        })
      )
    );
    staffId = staff.id;
    requesterId = req.id;

    const category = await prisma.category.findFirst({ where: { isActive: true }, orderBy: { name: "asc" } });
    const system = await prisma.relatedSystem.findFirst({ where: { isActive: true }, orderBy: { name: "asc" } });
    if (!category || !system) throw new Error("Staff security test requires seeded active Category/RelatedSystem");
    categoryId = category.id;
    relatedSystemId = system.id;

    const ticket = await prisma.ticket.create({
      data: {
        ticketNumber: `48${RUN.slice(-6)}-5001`,
        requesterId,
        categoryId,
        relatedSystemId,
        summary: `Security probe ${RUN}`,
        description: "Security probe description.",
        requestedPriority: "MEDIUM",
        itPriority: "MEDIUM",
        currentStatus: "OPEN",
        ticketOwnerId: staffId,
      },
      select: { id: true },
    });
    ticketId = ticket.id;

    cookieStaff = await loginAs(EMAIL_STAFF);
    cookieRequester = await loginAs(EMAIL_REQUESTER);
  });

  afterAll(async () => {
    await prisma.ticket.deleteMany({ where: { requesterId } });
    await prisma.user.deleteMany({ where: { email: { in: [EMAIL_STAFF, EMAIL_REQUESTER] } } });
  });

  it("SEC-06: missing, null, and unapproved Origins are rejected before processing", async () => {
    const paths: Array<{ method: "post" | "patch"; url: string; body: Record<string, unknown> }> = [
      { method: "post", url: `/api/staff/tickets/${ticketId}/claim`, body: {} },
      { method: "patch", url: `/api/staff/tickets/${ticketId}/owner`, body: { ownerId: staffId, expectedOwnerId: staffId } },
      { method: "patch", url: `/api/staff/tickets/${ticketId}/it-priority`, body: { itPriority: "HIGH", expectedItPriority: "MEDIUM" } },
      { method: "patch", url: `/api/staff/tickets/${ticketId}/status`, body: { status: "IN_PROGRESS", expectedCurrentStatus: "OPEN" } },
    ];
    for (const p of paths) {
      // Missing Origin (supertest sends none by default).
      const missing = await request(app)[p.method](p.url).set("Cookie", cookieStaff).send(p.body).expect(403);
      expect(missing.body.error.code).toBe("ORIGIN_NOT_ALLOWED");
      // Origin: null.
      const nullOrigin = await request(app)[p.method](p.url).set("Cookie", cookieStaff).set("Origin", "null").send(p.body).expect(403);
      expect(nullOrigin.body.error.code).toBe("ORIGIN_NOT_ALLOWED");
      // Unapproved origin.
      const evil = await request(app)[p.method](p.url).set("Cookie", cookieStaff).set("Origin", "https://evil.example").send(p.body).expect(403);
      expect(evil.body.error.code).toBe("ORIGIN_NOT_ALLOWED");
      // Approved origin passes the boundary (business result may vary).
      const ok = await request(app)[p.method](p.url).set("Cookie", cookieStaff).set("Origin", ORIGIN).send(p.body);
      expect(ok.body?.error?.code ?? "OK").not.toBe("ORIGIN_NOT_ALLOWED");
    }
    // Reads are not origin-gated: GET without Origin works with a session.
    await request(app).get("/api/staff/tickets").set("Cookie", cookieStaff).expect(200);
  });

  it("SEC-01: Requester is forbidden on every mutating staff route", async () => {
    const claim = await request(app)
      .post(`/api/staff/tickets/${ticketId}/claim`)
      .set("Cookie", cookieRequester)
      .set("Origin", ORIGIN)
      .send({})
      .expect(403);
    expect(claim.body.error.code).toBe("FORBIDDEN");

    for (const [url, body] of [
      [`/api/staff/tickets/${ticketId}/owner`, { ownerId: staffId, expectedOwnerId: staffId }],
      [`/api/staff/tickets/${ticketId}/it-priority`, { itPriority: "HIGH", expectedItPriority: "MEDIUM" }],
      [`/api/staff/tickets/${ticketId}/status`, { status: "IN_PROGRESS", expectedCurrentStatus: "OPEN" }],
    ] as Array<[string, Record<string, unknown>]>) {
      const res = await request(app)
        .patch(url)
        .set("Cookie", cookieRequester)
        .set("Origin", ORIGIN)
        .send(body)
        .expect(403);
      expect(res.body.error.code).toBe("FORBIDDEN");
    }
  });
});
