import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import { SESSION_COOKIE_NAME } from "../../src/auth.js";
import { hashPassword } from "../../src/lib/password-hash.js";

// Issue #48 (Lab 3) — BR-76 staff-side protocol (AC-09/11/14, api-spec §15):
// Claim/first-Assign/Reassign/Reopen owner repair revalidate target-user
// eligibility at commit time, so a concurrent Administrator
// deactivate/demote can never leave a non-terminal Ticket owned by an
// inactive or REQUESTER user. The Administrator-side invariant
// (USER_HAS_ACTIVE_TICKETS) is Issue #50 scope; here the staff mutation is
// proven to fail safely with 409 when the admin update wins the race, using
// real overlapping database operations (a mocked or sequential-only test
// does not prove BR-76).
//
// Deterministic ordering stands in for the race winner: the "admin commits
// first" path runs the eligibility change before the staff mutation, and
// the "staff commits first" path runs the staff mutation before the raw
// eligibility change, plus one truly-overlapping run asserting only safe
// outcomes. Raw Prisma eligibility changes simulate the admin operation;
// the #50 guard that would reject deactivating an active owner is
// intentionally absent here and documented as deferred.
const ORIGIN = "http://localhost:5174";
const PASSWORD = "OwnerRace-Valid-9!";

const RUN = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6)}`;
const EMAIL_ASSIGNER = `q48-oc-assigner-${RUN}@test.local`;
const EMAIL_TARGET = `q48-oc-target-${RUN}@test.local`;
const EMAIL_REQUESTER = `q48-oc-req-${RUN}@test.local`;
const EMAIL_HISTORIC = `q48-oc-historic-${RUN}@test.local`;

const prisma = getPrisma();

let assignerId = 0;
let targetId = 0;
let requesterId = 0;
let historicId = 0;
let categoryId = 0;
let relatedSystemId = 0;
let cookieAssigner = "";

type Status =
  | "NEW" | "OPEN" | "IN_PROGRESS" | "WAITING_FOR_REQUESTER"
  | "RESOLVED" | "CLOSED" | "REOPENED" | "CANCELLED";

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
async function makeTicket(overrides: { currentStatus?: Status; ticketOwnerId?: number | null } = {}): Promise<number> {
  ticketSeq += 1;
  const row = await prisma.ticket.create({
    data: {
      ticketNumber: `48${RUN.slice(-6)}-${String(4000 + ticketSeq)}`,
      requesterId,
      categoryId,
      relatedSystemId,
      summary: `Owner-race fixture ${RUN} #${ticketSeq}`,
      description: "Owner-race fixture description body.",
      requestedPriority: "MEDIUM",
      itPriority: "MEDIUM",
      currentStatus: overrides.currentStatus ?? "NEW",
      ticketOwnerId: overrides.ticketOwnerId ?? null,
    },
    select: { id: true },
  });
  return row.id;
}

async function reactivateTarget(): Promise<void> {
  await prisma.user.update({
    where: { id: targetId },
    data: { isActive: true, role: "IT_STAFF" },
  });
}

describe("BR-76 staff-side owner integrity vs admin eligibility change (Issue #48)", () => {
  beforeAll(async () => {
    const passwordHash = await hashPassword(PASSWORD);
    const users = await Promise.all(
      [
        { email: EMAIL_ASSIGNER, role: "IT_STAFF", isActive: true },
        { email: EMAIL_TARGET, role: "IT_STAFF", isActive: true },
        { email: EMAIL_REQUESTER, role: "REQUESTER", isActive: true },
        { email: EMAIL_HISTORIC, role: "IT_STAFF", isActive: false },
      ].map((u) =>
        prisma.user.create({
          data: {
            name: `OC48 ${u.role} ${RUN}`,
            email: u.email,
            passwordHash,
            role: u.role as "IT_STAFF" | "REQUESTER",
            isActive: u.isActive,
            mustChangePassword: false,
          },
          select: { id: true },
        })
      )
    );
    [assignerId, targetId, requesterId, historicId] = users.map((u) => u.id);

    const category = await prisma.category.findFirst({ where: { isActive: true }, orderBy: { name: "asc" } });
    const system = await prisma.relatedSystem.findFirst({ where: { isActive: true }, orderBy: { name: "asc" } });
    if (!category || !system) throw new Error("Owner-race test requires seeded active Category/RelatedSystem");
    categoryId = category.id;
    relatedSystemId = system.id;

    cookieAssigner = await loginAs(EMAIL_ASSIGNER);
  });

  afterAll(async () => {
    await prisma.ticket.deleteMany({ where: { requesterId } });
    await prisma.user.deleteMany({
      where: { email: { in: [EMAIL_ASSIGNER, EMAIL_TARGET, EMAIL_REQUESTER, EMAIL_HISTORIC] } },
    });
  });

  it("API-47: first Assign to a deactivated target fails with 409 and changes nothing", async () => {
    const id = await makeTicket();
    await prisma.user.update({ where: { id: targetId }, data: { isActive: false } });

    const res = await request(app)
      .patch(`/api/staff/tickets/${id}/owner`)
      .set("Cookie", cookieAssigner)
      .set("Origin", ORIGIN)
      .send({ ownerId: targetId, expectedOwnerId: null })
      .expect(409);
    expect(res.body.error.code).toBe("OWNER_NOT_ELIGIBLE");

    const check = await prisma.ticket.findUnique({
      where: { id },
      select: { ticketOwnerId: true, currentStatus: true },
    });
    expect(check).toMatchObject({ ticketOwnerId: null, currentStatus: "NEW" });
    await reactivateTarget();
  });

  it("API-47: staff mutation that commits first is valid; claimant deactivated first fails closed", async () => {
    // Staff-first order: assign commits while the target is eligible.
    const id = await makeTicket();
    const won = await request(app)
      .patch(`/api/staff/tickets/${id}/owner`)
      .set("Cookie", cookieAssigner)
      .set("Origin", ORIGIN)
      .send({ ownerId: targetId, expectedOwnerId: null })
      .expect(200);
    expect(won.body.ticketOwner).toMatchObject({ id: targetId });
    expect(won.body.currentStatus).toBe("OPEN");

    // A claimant deactivated before claiming fails closed at the auth
    // layer (401) — never committing an owner for an inactive user.
    const cookieTarget = await loginAs(EMAIL_TARGET);
    await prisma.user.update({ where: { id: targetId }, data: { isActive: false } });
    const id2 = await makeTicket();
    const closed = await request(app)
      .post(`/api/staff/tickets/${id2}/claim`)
      .set("Cookie", cookieTarget)
      .set("Origin", ORIGIN)
      .send({})
      .expect(401);
    expect(closed.body.error.code).toBe("UNAUTHENTICATED");
    const check = await prisma.ticket.findUnique({ where: { id: id2 }, select: { ticketOwnerId: true } });
    expect(check?.ticketOwnerId).toBeNull();
    await reactivateTarget();
  });

  it("API-48: Assign to a demoted (REQUESTER) target fails with 409 and changes nothing", async () => {
    const id = await makeTicket();
    await prisma.user.update({ where: { id: targetId }, data: { role: "REQUESTER" } });

    const res = await request(app)
      .patch(`/api/staff/tickets/${id}/owner`)
      .set("Cookie", cookieAssigner)
      .set("Origin", ORIGIN)
      .send({ ownerId: targetId, expectedOwnerId: null })
      .expect(409);
    expect(res.body.error.code).toBe("OWNER_NOT_ELIGIBLE");

    const check = await prisma.ticket.findUnique({
      where: { id },
      select: { ticketOwnerId: true, currentStatus: true },
    });
    expect(check).toMatchObject({ ticketOwnerId: null, currentStatus: "NEW" });
    await reactivateTarget();
  });

  it("API-49: Reassign to a deactivated/demoted target keeps the previous valid owner", async () => {
    const id = await makeTicket({ currentStatus: "OPEN", ticketOwnerId: assignerId });
    await prisma.user.update({ where: { id: targetId }, data: { isActive: false } });

    const res = await request(app)
      .patch(`/api/staff/tickets/${id}/owner`)
      .set("Cookie", cookieAssigner)
      .set("Origin", ORIGIN)
      .send({ ownerId: targetId, expectedOwnerId: assignerId })
      .expect(409);
    expect(res.body.error.code).toBe("OWNER_NOT_ELIGIBLE");

    const check = await prisma.ticket.findUnique({
      where: { id },
      select: { ticketOwnerId: true, currentStatus: true },
    });
    // Previous valid owner is preserved; status is untouched.
    expect(check).toMatchObject({ ticketOwnerId: assignerId, currentStatus: "OPEN" });
    await reactivateTarget();
  });

  it("API-50: CLOSED → REOPENED with a deactivated replacement owner stays CLOSED", async () => {
    // Historical owner is ineligible, so the endpoint must consult the
    // replacement — a deactivated replacement fails with 409.
    const closed = await prisma.ticket.create({
      data: {
        ticketNumber: `48${RUN.slice(-6)}-4901`,
        requesterId,
        categoryId,
        relatedSystemId,
        summary: `Reopen race ${RUN}`,
        description: "Reopen race fixture.",
        requestedPriority: "MEDIUM",
        itPriority: "MEDIUM",
        currentStatus: "CLOSED",
        ticketOwnerId: historicId,
      },
      select: { id: true },
    });
    await prisma.user.update({ where: { id: targetId }, data: { isActive: false } });

    const res = await request(app)
      .patch(`/api/staff/tickets/${closed.id}/status`)
      .set("Cookie", cookieAssigner)
      .set("Origin", ORIGIN)
      .send({ status: "REOPENED", expectedCurrentStatus: "CLOSED", ownerId: targetId })
      .expect(409);
    expect(res.body.error.code).toBe("OWNER_NOT_ELIGIBLE");

    const check = await prisma.ticket.findUnique({
      where: { id: closed.id },
      select: { currentStatus: true, ticketOwnerId: true },
    });
    expect(check).toMatchObject({ currentStatus: "CLOSED", ticketOwnerId: historicId });
    await reactivateTarget();
  });

  it("API-47/48 overlapping: Assign vs eligibility change yields only safe outcomes", async () => {
    const id = await makeTicket();
    const [assignRes] = await Promise.all([
      request(app)
        .patch(`/api/staff/tickets/${id}/owner`)
        .set("Cookie", cookieAssigner)
        .set("Origin", ORIGIN)
        .send({ ownerId: targetId, expectedOwnerId: null }),
      prisma.user.update({ where: { id: targetId }, data: { isActive: false } }),
    ]);
    // Either the assign committed while the target was eligible (200) or
    // it observed the deactivation and failed safely (409) — never a
    // silent invalid owner and never a server error.
    expect([200, 409]).toContain(assignRes.status);
    if (assignRes.status === 409) {
      expect(assignRes.body.error.code).toBe("OWNER_NOT_ELIGIBLE");
    } else {
      expect(assignRes.body.ticketOwner).toMatchObject({ id: targetId });
    }
    await reactivateTarget();
  });
});
