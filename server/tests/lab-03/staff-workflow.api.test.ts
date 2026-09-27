import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import { SESSION_COOKIE_NAME } from "../../src/auth.js";
import { hashPassword } from "../../src/lib/password-hash.js";

// Issue #48 (Lab 3) — Staff Ticket Detail, ownership (FR-10/11, AC-07/09,
// api-spec §9): shared detail retrieval, eligible-owners picker, Claim with
// atomic NEW→OPEN, assign/reassign with stale-write protection.
const ORIGIN = "http://localhost:5174";
const PASSWORD = "Workflow-Valid-9!";

const RUN = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6)}`;
const EMAIL_STAFF_A = `q48-wf-a-${RUN}@test.local`;
const EMAIL_STAFF_B = `q48-wf-b-${RUN}@test.local`;
const EMAIL_ADMIN = `q48-wf-admin-${RUN}@test.local`;
const EMAIL_REQUESTER = `q48-wf-req-${RUN}@test.local`;
const EMAIL_INACTIVE = `q48-wf-inactive-${RUN}@test.local`;

const prisma = getPrisma();

let staffA = 0;
let staffB = 0;
let adminId = 0;
let requesterId = 0;
let inactiveId = 0;
let categoryId = 0;
let relatedSystemId = 0;

let cookieA = "";
let cookieB = "";
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

let ticketSeq = 0;
async function makeTicket(overrides: {
  currentStatus?: "NEW" | "OPEN" | "IN_PROGRESS" | "WAITING_FOR_REQUESTER" | "RESOLVED" | "CLOSED" | "REOPENED" | "CANCELLED";
  ticketOwnerId?: number | null;
  requestedPriority?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
} = {}): Promise<number> {
  ticketSeq += 1;
  const row = await prisma.ticket.create({
    data: {
      ticketNumber: `48${RUN.slice(-6)}-${String(2000 + ticketSeq)}`,
      requesterId,
      categoryId,
      relatedSystemId,
      summary: `Workflow fixture ${RUN} #${ticketSeq}`,
      description: "Workflow fixture description body.",
      requestedPriority: overrides.requestedPriority ?? "MEDIUM",
      itPriority: overrides.requestedPriority ?? "MEDIUM",
      currentStatus: overrides.currentStatus ?? "NEW",
      ticketOwnerId: overrides.ticketOwnerId ?? null,
    },
    select: { id: true },
  });
  return row.id;
}

describe("Staff Ticket Detail and ownership (Issue #48, AC-07/09)", () => {
  beforeAll(async () => {
    const passwordHash = await hashPassword(PASSWORD);
    const users = await Promise.all(
      [
        { email: EMAIL_STAFF_A, role: "IT_STAFF", isActive: true },
        { email: EMAIL_STAFF_B, role: "IT_STAFF", isActive: true },
        { email: EMAIL_ADMIN, role: "ADMINISTRATOR", isActive: true },
        { email: EMAIL_REQUESTER, role: "REQUESTER", isActive: true },
        { email: EMAIL_INACTIVE, role: "IT_STAFF", isActive: false },
      ].map((u) =>
        prisma.user.create({
          data: {
            name: `WF48 ${u.role} ${RUN}`,
            email: u.email,
            passwordHash,
            role: u.role as "IT_STAFF" | "ADMINISTRATOR" | "REQUESTER",
            isActive: u.isActive,
            mustChangePassword: false,
          },
          select: { id: true },
        })
      )
    );
    [staffA, staffB, adminId, requesterId, inactiveId] = users.map((u) => u.id);

    const category = await prisma.category.findFirst({
      where: { isActive: true },
      orderBy: { name: "asc" },
    });
    const system = await prisma.relatedSystem.findFirst({
      where: { isActive: true },
      orderBy: { name: "asc" },
    });
    if (!category || !system) throw new Error("Workflow test requires seeded active Category/RelatedSystem");
    categoryId = category.id;
    relatedSystemId = system.id;

    cookieA = await loginAs(EMAIL_STAFF_A);
    cookieB = await loginAs(EMAIL_STAFF_B);
    cookieAdmin = await loginAs(EMAIL_ADMIN);
    cookieRequester = await loginAs(EMAIL_REQUESTER);
  });

  afterAll(async () => {
    await prisma.ticket.deleteMany({ where: { requesterId } });
    await prisma.user.deleteMany({
      where: { email: { in: [EMAIL_STAFF_A, EMAIL_STAFF_B, EMAIL_ADMIN, EMAIL_REQUESTER, EMAIL_INACTIVE] } },
    });
  });

  it("API-24: Staff/Admin open shared detail without owning it; Requester staff route is forbidden", async () => {
    const id = await makeTicket({ currentStatus: "OPEN", ticketOwnerId: staffB });

    const staff = await request(app).get(`/api/staff/tickets/${id}`).set("Cookie", cookieA).expect(200);
    expect(staff.body.id).toBe(id);
    expect(staff.body.requester).toMatchObject({ id: requesterId, name: expect.any(String), email: expect.any(String) });
    expect(staff.body.category).toMatchObject({ id: categoryId, name: expect.any(String) });
    expect(staff.body.relatedSystem).toMatchObject({ id: relatedSystemId, name: expect.any(String) });
    expect(staff.body.requestedPriority).toBe("MEDIUM");
    expect(staff.body.itPriority).toBe("MEDIUM");
    expect(staff.body.currentStatus).toBe("OPEN");
    expect(staff.body.ticketOwner).toMatchObject({ id: staffB, name: expect.any(String), role: "IT_STAFF" });
    expect("requesterResolutionIndicatedAt" in staff.body).toBe(true);
    expect("internalNotes" in staff.body).toBe(false);
    expect(Array.isArray(staff.body.attachments)).toBe(true);

    const admin = await request(app).get(`/api/staff/tickets/${id}`).set("Cookie", cookieAdmin).expect(200);
    expect(admin.body.id).toBe(id);

    const denied = await request(app).get(`/api/staff/tickets/${id}`).set("Cookie", cookieRequester).expect(403);
    expect(denied.body.error.code).toBe("FORBIDDEN");

    const missing = await request(app).get("/api/staff/tickets/999999999").set("Cookie", cookieA).expect(404);
    expect(missing.body.error.code).toBe("TICKET_NOT_FOUND");
  });

  it("API-24: eligible-owners picker lists active Staff/Admin only", async () => {
    const res = await request(app).get("/api/staff/ticket-owners").set("Cookie", cookieA).expect(200);
    const ids = res.body.data.map((u: { id: number }) => u.id);
    expect(ids).toContain(staffA);
    expect(ids).toContain(staffB);
    expect(ids).toContain(adminId);
    expect(ids).not.toContain(requesterId);
    expect(ids).not.toContain(inactiveId);
    for (const u of res.body.data) {
      expect(Object.keys(u).sort()).toEqual(["id", "name", "role"]);
    }
    const denied = await request(app).get("/api/staff/ticket-owners").set("Cookie", cookieRequester).expect(403);
    expect(denied.body.error.code).toBe("FORBIDDEN");
  });

  it("API-25: first Claim of unassigned NEW commits owner + OPEN atomically", async () => {
    const id = await makeTicket();
    const res = await request(app)
      .post(`/api/staff/tickets/${id}/claim`)
      .set("Cookie", cookieA)
      .set("Origin", ORIGIN)
      .send({})
      .expect(200);
    expect(res.body.ticketOwner).toMatchObject({ id: staffA });
    expect(res.body.currentStatus).toBe("OPEN");

    const check = await prisma.ticket.findUnique({ where: { id }, select: { ticketOwnerId: true, currentStatus: true } });
    expect(check).toMatchObject({ ticketOwnerId: staffA, currentStatus: "OPEN" });

    // Claiming an owned ticket is rejected.
    const again = await request(app)
      .post(`/api/staff/tickets/${id}/claim`)
      .set("Cookie", cookieB)
      .set("Origin", ORIGIN)
      .send({})
      .expect(409);
    expect(again.body.error.code).toBe("TICKET_ALREADY_ASSIGNED");
  });

  it("API-26: two concurrent Claims have exactly one winner", async () => {
    const id = await makeTicket();
    const [r1, r2] = await Promise.all([
      request(app).post(`/api/staff/tickets/${id}/claim`).set("Cookie", cookieA).set("Origin", ORIGIN).send({}),
      request(app).post(`/api/staff/tickets/${id}/claim`).set("Cookie", cookieB).set("Origin", ORIGIN).send({}),
    ]);
    const codes = [r1.status, r2.status].sort();
    expect(codes).toEqual([200, 409]);
    const loser = r1.status === 409 ? r1 : r2;
    expect(loser.body.error.code).toBe("TICKET_ALREADY_ASSIGNED");

    const final = await prisma.ticket.findUnique({ where: { id }, select: { ticketOwnerId: true, currentStatus: true } });
    expect([staffA, staffB]).toContain(final?.ticketOwnerId);
    expect(final?.currentStatus).toBe("OPEN");
  });

  it("API-27: first assign opens NEW; reassign preserves status; stale expected owner is rejected", async () => {
    const id = await makeTicket();
    const first = await request(app)
      .patch(`/api/staff/tickets/${id}/owner`)
      .set("Cookie", cookieA)
      .set("Origin", ORIGIN)
      .send({ ownerId: staffB, expectedOwnerId: null })
      .expect(200);
    expect(first.body.ticketOwner).toMatchObject({ id: staffB });
    expect(first.body.currentStatus).toBe("OPEN");

    const reassign = await request(app)
      .patch(`/api/staff/tickets/${id}/owner`)
      .set("Cookie", cookieA)
      .set("Origin", ORIGIN)
      .send({ ownerId: staffA, expectedOwnerId: staffB })
      .expect(200);
    expect(reassign.body.ticketOwner).toMatchObject({ id: staffA });
    expect(reassign.body.currentStatus).toBe("OPEN");

    // Same-owner update is idempotent when expected state matches.
    const same = await request(app)
      .patch(`/api/staff/tickets/${id}/owner`)
      .set("Cookie", cookieA)
      .set("Origin", ORIGIN)
      .send({ ownerId: staffA, expectedOwnerId: staffA })
      .expect(200);
    expect(same.body.ticketOwner).toMatchObject({ id: staffA });

    // Stale expected owner.
    const stale = await request(app)
      .patch(`/api/staff/tickets/${id}/owner`)
      .set("Cookie", cookieA)
      .set("Origin", ORIGIN)
      .send({ ownerId: staffB, expectedOwnerId: staffB })
      .expect(409);
    expect(stale.body.error.code).toBe("TICKET_STATE_CHANGED");

    // Unknown body field + missing keys are rejected strictly.
    const unknown = await request(app)
      .patch(`/api/staff/tickets/${id}/owner`)
      .set("Cookie", cookieA)
      .set("Origin", ORIGIN)
      .send({ ownerId: staffA, expectedOwnerId: staffA, admin: true })
      .expect(400);
    expect(unknown.body.error.code).toBe("VALIDATION_FAILED");

    const denied = await request(app)
      .patch(`/api/staff/tickets/${id}/owner`)
      .set("Cookie", cookieRequester)
      .set("Origin", ORIGIN)
      .send({ ownerId: staffA, expectedOwnerId: staffA })
      .expect(403);
    expect(denied.body.error.code).toBe("FORBIDDEN");
  });

  it("API-28: ineligible owners and terminal standalone owner updates are rejected", async () => {
    const id = await makeTicket();

    const inactive = await request(app)
      .patch(`/api/staff/tickets/${id}/owner`)
      .set("Cookie", cookieA)
      .set("Origin", ORIGIN)
      .send({ ownerId: inactiveId, expectedOwnerId: null })
      .expect(409);
    expect(inactive.body.error.code).toBe("OWNER_NOT_ELIGIBLE");

    const reqUser = await request(app)
      .patch(`/api/staff/tickets/${id}/owner`)
      .set("Cookie", cookieA)
      .set("Origin", ORIGIN)
      .send({ ownerId: requesterId, expectedOwnerId: null })
      .expect(409);
    expect(reqUser.body.error.code).toBe("OWNER_NOT_ELIGIBLE");

    // Ticket state is unchanged after rejected mutations.
    const check = await prisma.ticket.findUnique({ where: { id }, select: { ticketOwnerId: true, currentStatus: true } });
    expect(check).toMatchObject({ ticketOwnerId: null, currentStatus: "NEW" });

    // Standalone owner mutation on CLOSED / CANCELLED is rejected.
    const closed = await makeTicket({ currentStatus: "CLOSED", ticketOwnerId: staffA });
    const onClosed = await request(app)
      .patch(`/api/staff/tickets/${closed}/owner`)
      .set("Cookie", cookieA)
      .set("Origin", ORIGIN)
      .send({ ownerId: staffB, expectedOwnerId: staffA })
      .expect(409);
    expect(onClosed.body.error.code).toBe("INVALID_TICKET_STATE");

    const cancelled = await makeTicket({ currentStatus: "CANCELLED", ticketOwnerId: staffA });
    const onCancelled = await request(app)
      .patch(`/api/staff/tickets/${cancelled}/owner`)
      .set("Cookie", cookieA)
      .set("Origin", ORIGIN)
      .send({ ownerId: staffB, expectedOwnerId: staffA })
      .expect(409);
    expect(onCancelled.body.error.code).toBe("INVALID_TICKET_STATE");
  });
});
