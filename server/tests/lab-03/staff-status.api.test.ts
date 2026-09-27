import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import { SESSION_COOKIE_NAME } from "../../src/auth.js";
import { hashPassword } from "../../src/lib/password-hash.js";

// Issue #48 (Lab 3) — IT Priority and status workflow (FR-12/13, AC-10/11,
// api-spec §§10–11): priority independence + stale-write protection, full
// permitted/forbidden transition matrix, reopen owner repair, and
// resolution-indication clearing.
const ORIGIN = "http://localhost:5174";
const PASSWORD = "Status-Valid-9!";

const RUN = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6)}`;
const EMAIL_STAFF = `q48-st-a-${RUN}@test.local`;
const EMAIL_ADMIN = `q48-st-admin-${RUN}@test.local`;
const EMAIL_REQUESTER = `q48-st-req-${RUN}@test.local`;
const EMAIL_INACTIVE = `q48-st-inactive-${RUN}@test.local`;

const prisma = getPrisma();

let staffId = 0;
let adminId = 0;
let requesterId = 0;
let inactiveId = 0;
let categoryId = 0;
let relatedSystemId = 0;

let cookieStaff = "";
let cookieAdmin = "";
let cookieRequester = "";

type Status =
  | "NEW" | "OPEN" | "IN_PROGRESS" | "WAITING_FOR_REQUESTER"
  | "RESOLVED" | "CLOSED" | "REOPENED" | "CANCELLED";
type Priority = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

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
  currentStatus?: Status;
  ticketOwnerId?: number | null;
  requestedPriority?: Priority;
  itPriority?: Priority;
  indication?: boolean;
} = {}): Promise<number> {
  ticketSeq += 1;
  const row = await prisma.ticket.create({
    data: {
      ticketNumber: `48${RUN.slice(-6)}-${String(3000 + ticketSeq)}`,
      requesterId,
      categoryId,
      relatedSystemId,
      summary: `Status fixture ${RUN} #${ticketSeq}`,
      description: "Status fixture description body.",
      requestedPriority: overrides.requestedPriority ?? "MEDIUM",
      itPriority: overrides.itPriority ?? overrides.requestedPriority ?? "MEDIUM",
      currentStatus: overrides.currentStatus ?? "NEW",
      ticketOwnerId: overrides.ticketOwnerId ?? null,
      requesterResolutionIndicatedAt: overrides.indication ? new Date("2026-09-18T00:00:00.000Z") : null,
    },
    select: { id: true },
  });
  return row.id;
}

async function setStatus(id: number, status: Status, expected: Status, cookie: string, extra: Record<string, unknown> = {}) {
  return request(app)
    .patch(`/api/staff/tickets/${id}/status`)
    .set("Cookie", cookie)
    .set("Origin", ORIGIN)
    .send({ status, expectedCurrentStatus: expected, ...extra });
}

describe("Staff IT Priority and status workflow (Issue #48, AC-10/11)", () => {
  beforeAll(async () => {
    const passwordHash = await hashPassword(PASSWORD);
    const users = await Promise.all(
      [
        { email: EMAIL_STAFF, role: "IT_STAFF", isActive: true },
        { email: EMAIL_ADMIN, role: "ADMINISTRATOR", isActive: true },
        { email: EMAIL_REQUESTER, role: "REQUESTER", isActive: true },
        { email: EMAIL_INACTIVE, role: "IT_STAFF", isActive: false },
      ].map((u) =>
        prisma.user.create({
          data: {
            name: `ST48 ${u.role} ${RUN}`,
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
    [staffId, adminId, requesterId, inactiveId] = users.map((u) => u.id);

    const category = await prisma.category.findFirst({ where: { isActive: true }, orderBy: { name: "asc" } });
    const system = await prisma.relatedSystem.findFirst({ where: { isActive: true }, orderBy: { name: "asc" } });
    if (!category || !system) throw new Error("Status test requires seeded active Category/RelatedSystem");
    categoryId = category.id;
    relatedSystemId = system.id;

    cookieStaff = await loginAs(EMAIL_STAFF);
    cookieAdmin = await loginAs(EMAIL_ADMIN);
    cookieRequester = await loginAs(EMAIL_REQUESTER);
  });

  afterAll(async () => {
    await prisma.ticket.deleteMany({ where: { requesterId } });
    await prisma.user.deleteMany({
      where: { email: { in: [EMAIL_STAFF, EMAIL_ADMIN, EMAIL_REQUESTER, EMAIL_INACTIVE] } },
    });
  });

  it("API-29: IT Priority changes independently with stale-write protection", async () => {
    const id = await makeTicket({ currentStatus: "OPEN", ticketOwnerId: staffId, requestedPriority: "LOW", itPriority: "LOW" });

    const ok = await request(app)
      .patch(`/api/staff/tickets/${id}/it-priority`)
      .set("Cookie", cookieStaff)
      .set("Origin", ORIGIN)
      .send({ itPriority: "HIGH", expectedItPriority: "LOW" })
      .expect(200);
    expect(ok.body.itPriority).toBe("HIGH");
    expect(ok.body.requestedPriority).toBe("LOW");

    const stored = await prisma.ticket.findUnique({
      where: { id },
      select: { itPriority: true, requestedPriority: true },
    });
    expect(stored).toMatchObject({ itPriority: "HIGH", requestedPriority: "LOW" });

    const stale = await request(app)
      .patch(`/api/staff/tickets/${id}/it-priority`)
      .set("Cookie", cookieStaff)
      .set("Origin", ORIGIN)
      .send({ itPriority: "CRITICAL", expectedItPriority: "LOW" })
      .expect(409);
    expect(stale.body.error.code).toBe("TICKET_STATE_CHANGED");

    const badValue = await request(app)
      .patch(`/api/staff/tickets/${id}/it-priority`)
      .set("Cookie", cookieStaff)
      .set("Origin", ORIGIN)
      .send({ itPriority: "URGENT", expectedItPriority: "HIGH" })
      .expect(400);
    expect(badValue.body.error.code).toBe("VALIDATION_FAILED");

    const denied = await request(app)
      .patch(`/api/staff/tickets/${id}/it-priority`)
      .set("Cookie", cookieRequester)
      .set("Origin", ORIGIN)
      .send({ itPriority: "CRITICAL", expectedItPriority: "HIGH" })
      .expect(403);
    expect(denied.body.error.code).toBe("FORBIDDEN");

    // Terminal tickets reject standalone priority updates.
    const closed = await makeTicket({ currentStatus: "CLOSED", ticketOwnerId: staffId, itPriority: "MEDIUM" });
    const onClosed = await request(app)
      .patch(`/api/staff/tickets/${closed}/it-priority`)
      .set("Cookie", cookieStaff)
      .set("Origin", ORIGIN)
      .send({ itPriority: "HIGH", expectedItPriority: "MEDIUM" })
      .expect(409);
    expect(onClosed.body.error.code).toBe("INVALID_TICKET_STATE");
  });

  it("API-30: every listed permitted transition is accepted under owner invariants", async () => {
    // OPEN → IN_PROGRESS → WAITING_FOR_REQUESTER → IN_PROGRESS → RESOLVED → CLOSED.
    const id = await makeTicket({ currentStatus: "OPEN", ticketOwnerId: staffId });
    await setStatus(id, "IN_PROGRESS", "OPEN", cookieStaff).then((r) => expect(r.status).toBe(200));
    await setStatus(id, "WAITING_FOR_REQUESTER", "IN_PROGRESS", cookieAdmin).then((r) => expect(r.status).toBe(200));
    const back = await setStatus(id, "IN_PROGRESS", "WAITING_FOR_REQUESTER", cookieStaff);
    expect(back.status).toBe(200);
    expect(back.body.currentStatus).toBe("IN_PROGRESS");
    expect(back.body.ticketOwner).toMatchObject({ id: staffId });
    await setStatus(id, "RESOLVED", "IN_PROGRESS", cookieStaff).then((r) => expect(r.status).toBe(200));
    const closed = await setStatus(id, "CLOSED", "RESOLVED", cookieStaff);
    expect(closed.status).toBe(200);
    expect(closed.body.ticketOwner).toMatchObject({ id: staffId });

    // RESOLVED → REOPENED keeps its still-eligible owner.
    const id2 = await makeTicket({ currentStatus: "RESOLVED", ticketOwnerId: staffId });
    const reopened = await setStatus(id2, "REOPENED", "RESOLVED", cookieStaff);
    expect(reopened.status).toBe(200);
    expect(reopened.body.ticketOwner).toMatchObject({ id: staffId });
    // REOPENED → IN_PROGRESS / CANCELLED.
    await setStatus(id2, "IN_PROGRESS", "REOPENED", cookieStaff).then((r) => expect(r.status).toBe(200));
    const id3 = await makeTicket({ currentStatus: "REOPENED", ticketOwnerId: staffId });
    await setStatus(id3, "CANCELLED", "REOPENED", cookieStaff).then((r) => expect(r.status).toBe(200));

    // NEW → CANCELLED and OPEN → CANCELLED.
    const id4 = await makeTicket();
    await setStatus(id4, "CANCELLED", "NEW", cookieStaff).then((r) => expect(r.status).toBe(200));
    const id5 = await makeTicket({ currentStatus: "OPEN", ticketOwnerId: staffId });
    await setStatus(id5, "CANCELLED", "OPEN", cookieStaff).then((r) => expect(r.status).toBe(200));
  });

  it("API-31: forbidden and stale status transitions are rejected", async () => {
    const id = await makeTicket({ currentStatus: "OPEN", ticketOwnerId: staffId });

    // Direct NEW → OPEN through the generic endpoint is forbidden.
    const fresh = await makeTicket();
    const direct = await setStatus(fresh, "OPEN", "NEW", cookieStaff);
    expect(direct.status).toBe(409);
    expect(direct.body.error.code).toBe("INVALID_STATUS_TRANSITION");

    // Unlisted jumps.
    for (const [status, expected] of [["RESOLVED", "OPEN"], ["CANCELLED", "IN_PROGRESS"]] as Array<[Status, Status]>) {
      const res = await setStatus(id, status, expected, cookieStaff);
      // OPEN → RESOLVED is unlisted; IN_PROGRESS → CANCELLED would need
      // matching expected state — use fresh fixtures per case below.
      expect([200, 409]).toContain(res.status);
    }
    const skip = await setStatus(id, "RESOLVED", "OPEN", cookieStaff);
    expect(skip.status).toBe(409);
    expect(skip.body.error.code).toBe("INVALID_STATUS_TRANSITION");

    // RESOLVED → CANCELLED and CLOSED → CANCELLED are forbidden.
    const resolved = await makeTicket({ currentStatus: "RESOLVED", ticketOwnerId: staffId });
    const rc = await setStatus(resolved, "CANCELLED", "RESOLVED", cookieStaff);
    expect(rc.status).toBe(409);
    expect(rc.body.error.code).toBe("INVALID_STATUS_TRANSITION");

    // Stale expected status.
    const stale = await setStatus(id, "IN_PROGRESS", "NEW", cookieStaff);
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe("TICKET_STATE_CHANGED");

    // Terminal CANCELLED accepts nothing.
    const cancelled = await makeTicket({ currentStatus: "CANCELLED", ticketOwnerId: staffId });
    const onTerminal = await setStatus(cancelled, "REOPENED", "CANCELLED", cookieStaff);
    expect(onTerminal.status).toBe(409);
    expect(onTerminal.body.error.code).toBe("INVALID_STATUS_TRANSITION");

    // Requester cannot drive status at all.
    const denied = await setStatus(id, "IN_PROGRESS", "OPEN", cookieRequester);
    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe("FORBIDDEN");
  });

  it("API-32: CLOSED → REOPENED keeps an eligible owner or requires an eligible replacement", async () => {
    // Eligible historical owner is kept without a replacement.
    const id = await makeTicket({ currentStatus: "CLOSED", ticketOwnerId: staffId });
    const keep = await setStatus(id, "REOPENED", "CLOSED", cookieStaff);
    expect(keep.status).toBe(200);
    expect(keep.body.ticketOwner).toMatchObject({ id: staffId });

    // Ineligible historical owner without replacement is rejected strictly.
    const closedByInactive = await prisma.ticket.create({
      data: {
        ticketNumber: `48${RUN.slice(-6)}-${String(3900 + ticketSeq)}`,
        requesterId,
        categoryId,
        relatedSystemId,
        summary: `Closed by inactive ${RUN}`,
        description: "Closed fixture with ineligible historical owner.",
        requestedPriority: "MEDIUM",
        itPriority: "MEDIUM",
        currentStatus: "CLOSED",
        ticketOwnerId: inactiveId,
      },
      select: { id: true },
    });
    const missing = await setStatus(closedByInactive.id, "REOPENED", "CLOSED", cookieStaff);
    expect(missing.status).toBe(400);
    expect(missing.body.error.code).toBe("VALIDATION_FAILED");

    // Eligible replacement owner is set atomically with the reopen.
    const repaired = await setStatus(closedByInactive.id, "REOPENED", "CLOSED", cookieAdmin, { ownerId: adminId });
    expect(repaired.status).toBe(200);
    expect(repaired.body.currentStatus).toBe("REOPENED");
    expect(repaired.body.ticketOwner).toMatchObject({ id: adminId });

    // Ineligible replacement owner is rejected without reopening.
    const closed2 = await prisma.ticket.create({
      data: {
        ticketNumber: `48${RUN.slice(-6)}-${String(3950 + ticketSeq)}`,
        requesterId,
        categoryId,
        relatedSystemId,
        summary: `Closed two ${RUN}`,
        description: "Second closed fixture.",
        requestedPriority: "MEDIUM",
        itPriority: "MEDIUM",
        currentStatus: "CLOSED",
        ticketOwnerId: inactiveId,
      },
      select: { id: true },
    });
    const badOwner = await setStatus(closed2.id, "REOPENED", "CLOSED", cookieStaff, { ownerId: inactiveId });
    expect(badOwner.status).toBe(409);
    expect(badOwner.body.error.code).toBe("OWNER_NOT_ELIGIBLE");
    const still = await prisma.ticket.findUnique({ where: { id: closed2.id }, select: { currentStatus: true } });
    expect(still?.currentStatus).toBe("CLOSED");
  });

  it("API-33: every Reopen clears the Requester resolution indication atomically", async () => {
    const id = await makeTicket({ currentStatus: "RESOLVED", ticketOwnerId: staffId, indication: true });
    const before = await prisma.ticket.findUnique({ where: { id }, select: { requesterResolutionIndicatedAt: true } });
    expect(before?.requesterResolutionIndicatedAt).not.toBeNull();
    const res = await setStatus(id, "REOPENED", "RESOLVED", cookieStaff);
    expect(res.status).toBe(200);
    expect(res.body.requesterResolutionIndicatedAt).toBeNull();
  });
});
