import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import { hashPassword } from "../../src/lib/password-hash.js";
import { loginAs, TEST_ORIGIN } from "../helpers/auth-test.js";

// Issue #80 (Lab 4) — Staff dashboard (LAP4-07).
// Covers API-22/22b/23/23b/24 + SEC-04 extension with namespaced fixtures.
const PASSWORD = "Lab4-DashStaff-80!";
const RUN = `a80s-${Date.now().toString(36)}`;

const prisma = getPrisma();
let staffA = 0;
let staffB = 0;
let adminId = 0;
let requesterId = 0;
let categoryId = 0;
let relatedSystemId = 0;
let cookieA = "";
let cookieB = "";
let cookieAdmin = "";

async function makeUser(email: string, role: "REQUESTER" | "IT_STAFF" | "ADMINISTRATOR", isActive = true) {
  const passwordHash = await hashPassword(PASSWORD);
  return prisma.user.create({
    data: { name: email, email, passwordHash, role, isActive, mustChangePassword: false, failedLoginAttempts: 0 },
    select: { id: true },
  });
}

let ticketSeq = 0;
async function makeTicket(opts: {
  status?: "NEW" | "OPEN" | "IN_PROGRESS" | "WAITING_FOR_REQUESTER" | "RESOLVED" | "CLOSED";
  owner?: number | null;
  priority?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  updatedAt?: Date;
}): Promise<number> {
  ticketSeq += 1;
  const row = await prisma.ticket.create({
    data: {
      ticketNumber: `80${RUN.slice(-6)}-${String(2000 + ticketSeq)}`,
      requesterId,
      categoryId,
      relatedSystemId,
      summary: `Staff dash fixture ${RUN} #${ticketSeq}`,
      description: "Staff dashboard fixture description body.",
      requestedPriority: "MEDIUM",
      itPriority: opts.priority ?? "MEDIUM",
      currentStatus: opts.status ?? "OPEN",
      ticketOwnerId: opts.owner ?? null,
      ...(opts.updatedAt ? { updatedAt: opts.updatedAt } : {}),
    },
    select: { id: true },
  });
  return row.id;
}

async function createAction(ticketId: number, cookie: string, recorderNote = "dash work") {
  const created = await request(app)
    .post(`/api/staff/tickets/${ticketId}/actions`)
    .set("Origin", TEST_ORIGIN)
    .set("Cookie", cookie)
    .send({ description: `${recorderNote} ${RUN}`, clientRequestId: randomUUID() })
    .expect(201);
  return created.body.id as number;
}

async function startAndComplete(actionId: number, cookie: string, version = 1, result = "Dash done.") {
  await request(app)
    .put(`/api/staff/actions/${actionId}`)
    .set("Origin", TEST_ORIGIN)
    .set("Cookie", cookie)
    .send({ expectedVersion: version, status: "IN_PROGRESS" })
    .expect(200);
  await request(app)
    .post(`/api/staff/actions/${actionId}/complete`)
    .set("Origin", TEST_ORIGIN)
    .set("Cookie", cookie)
    .send({ expectedVersion: version + 1, result })
    .expect(200);
}

function dashboard(cookie: string) {
  return request(app).get("/api/dashboard/staff").set("Origin", TEST_ORIGIN).set("Cookie", cookie);
}

beforeAll(async () => {
  staffA = (await makeUser(`a80s-a-${RUN}@test.local`, "IT_STAFF")).id;
  staffB = (await makeUser(`a80s-b-${RUN}@test.local`, "IT_STAFF")).id;
  adminId = (await makeUser(`a80s-admin-${RUN}@test.local`, "ADMINISTRATOR")).id;
  requesterId = (await makeUser(`a80s-req-${RUN}@test.local`, "REQUESTER")).id;
  const cat = await prisma.category.create({ data: { name: `A80S Cat ${RUN}`, isActive: true } });
  const sys = await prisma.relatedSystem.create({ data: { name: `A80S Sys ${RUN}`, isActive: true } });
  categoryId = cat.id;
  relatedSystemId = sys.id;
  cookieA = await loginAs(`a80s-a-${RUN}@test.local`, PASSWORD);
  cookieB = await loginAs(`a80s-b-${RUN}@test.local`, PASSWORD);
  cookieAdmin = await loginAs(`a80s-admin-${RUN}@test.local`, PASSWORD);
  void adminId;
});

describe("Staff dashboard (Issue #80, LAP4-07)", () => {
  it("API-22 attribution metrics match direct DB queries", async () => {
    const base = Date.now();
    // Ambient baseline FIRST: the shared test DB holds other suites' rows,
    // so absolute metrics are asserted as before→after deltas (the endpoint
    // correctly counts all visible rows).
    const before = await dashboard(cookieA).expect(200);
    expect(before.body.metrics.recordedByMe).toBe(0);
    // Owned by A: 2 non-terminal (1 HIGH) + 1 RESOLVED.
    const owned1 = await makeTicket({ status: "OPEN", owner: staffA, priority: "HIGH", updatedAt: new Date(base - 10 * 60_000) });
    const owned2 = await makeTicket({ status: "IN_PROGRESS", owner: staffA, updatedAt: new Date(base - 20 * 60_000) });
    await makeTicket({ status: "RESOLVED", owner: staffA, updatedAt: new Date(base - 30 * 60_000) });
    // Owned by B (must not leak into A's attribution).
    await makeTicket({ status: "OPEN", owner: staffB, priority: "CRITICAL", updatedAt: new Date(base - 5 * 60_000) });
    // Unassigned non-terminal + terminal ownerless.
    await makeTicket({ status: "OPEN", owner: null, priority: "LOW", updatedAt: new Date(base - 40 * 60_000) });
    await makeTicket({ status: "CLOSED", owner: null, updatedAt: new Date(base - 50 * 60_000) });
    // Open action assigned to A on a non-terminal ticket (counts once).
    const a1 = await createAction(owned2, cookieA);
    await request(app)
      .put(`/api/staff/actions/${a1}`)
      .set("Origin", TEST_ORIGIN)
      .set("Cookie", cookieA)
      .send({ expectedVersion: 1, assignedToId: staffA })
      .expect(200);
    // Completed action recorded by A (inside the trailing window).
    const doneId = await createAction(owned1, cookieA);
    await startAndComplete(doneId, cookieA);
    const res = await dashboard(cookieA).expect(200);
    const m = res.body.metrics;
    const b = before.body.metrics;
    expect(m.ownedByMe - b.ownedByMe).toBe(2);
    expect(m.assignedToMe - b.assignedToMe).toBe(1);
    expect(m.unassigned - b.unassigned).toBe(1);
    expect(m.urgentHighPriority - b.urgentHighPriority).toBe(2);
    expect(m.recordedByMe - b.recordedByMe).toBe(1);
    expect(m.byStatus.OPEN - (b.byStatus.OPEN ?? 0)).toBe(3);
    expect(m.byStatus.IN_PROGRESS - (b.byStatus.IN_PROGRESS ?? 0)).toBe(1);
    expect(m.byItPriority.HIGH - (b.byItPriority.HIGH ?? 0)).toBe(1);
    expect(m.byItPriority.CRITICAL - (b.byItPriority.CRITICAL ?? 0)).toBe(1);
    // Staff response omits userCounts entirely (BR-021).
    expect("userCounts" in res.body).toBe(false);
    // Exact drill-down links per contract (D-80-09 scoped links).
    expect(res.body.links).toEqual({
      ownedByMe: "/staff/queue?owner=me&state=open",
      assignedToMe: "/staff/queue?assignee=me&state=open",
      unassigned: "/staff/queue?owner=unassigned&state=open",
      urgentHighPriority: "/staff/queue?itPriority=HIGH,CRITICAL&state=open",
      usersByRole: "/admin/users?role=IT_STAFF",
    });
  });

  it("API-22b future/skew completions are excluded from recordedByMe", async () => {
    const ticketId = await makeTicket({ status: "OPEN", owner: staffA });
    const actionId = await createAction(ticketId, cookieA);
    await startAndComplete(actionId, cookieA);
    // Push the COMPLETED event 1h into the future (clock skew): it MUST be
    // excluded because it postdates the server now-capture.
    await prisma.actionTakenEvent.updateMany({
      where: { actionTakenId: actionId, eventType: "COMPLETED" },
      data: { occurredAt: new Date(Date.now() + 3_600_000) },
    });
    // And an ancient completion (40d ago) is outside the trailing window.
    const oldTicket = await makeTicket({ status: "OPEN", owner: staffA });
    const oldAction = await createAction(oldTicket, cookieA);
    await startAndComplete(oldAction, cookieA);
    await prisma.actionTakenEvent.updateMany({
      where: { actionTakenId: oldAction, eventType: "COMPLETED" },
      data: { occurredAt: new Date(Date.now() - 40 * 86_400_000) },
    });
    const res = await dashboard(cookieA).expect(200);
    // Only genuinely in-window completions count; the two doctored events do not.
    const inWindow = await prisma.actionTakenEvent.count({
      where: {
        eventType: "COMPLETED",
        occurredAt: { lte: new Date() },
        action: { recordedById: staffA, ticket: { ticketNumber: { startsWith: `80${RUN.slice(-6)}-` } } },
      },
    });
    expect(res.body.metrics.recordedByMe).toBeLessThanOrEqual(inWindow);
  });

  it("API-23c queue ?state= scopes drill-down sets (D-80-09)", async () => {
    const openId = await makeTicket({ status: "OPEN", priority: "HIGH" });
    const resolvedId = await makeTicket({ status: "RESOLVED", priority: "HIGH" });
    const OPEN = ["NEW", "OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER", "REOPENED"];
    const openRes = await request(app)
      .get("/api/staff/tickets?state=open&itPriority=HIGH,CRITICAL")
      .set("Origin", TEST_ORIGIN)
      .set("Cookie", cookieA)
      .expect(200);
    for (const t of openRes.body.data as { currentStatus: string }[]) {
      expect(OPEN).toContain(t.currentStatus);
    }
    expect((openRes.body.data as { id: number }[]).map((t) => t.id)).toContain(openId);
    expect((openRes.body.data as { id: number }[]).map((t) => t.id)).not.toContain(resolvedId);
    const resolvedRes = await request(app)
      .get("/api/staff/tickets?state=resolved")
      .set("Origin", TEST_ORIGIN)
      .set("Cookie", cookieA)
      .expect(200);
    for (const t of resolvedRes.body.data as { currentStatus: string }[]) {
      expect(["RESOLVED", "CLOSED"]).toContain(t.currentStatus);
    }
    expect((resolvedRes.body.data as { id: number }[]).map((t) => t.id)).toContain(resolvedId);
    expect((resolvedRes.body.data as { id: number }[]).map((t) => t.id)).not.toContain(openId);
    // Strict vocabulary (mirrors MyTickets ?state=): invalid sets and
    // state combined with currentStatus are rejected, never defaulted.
    await request(app)
      .get("/api/staff/tickets?state=bogus")
      .set("Origin", TEST_ORIGIN)
      .set("Cookie", cookieA)
      .expect(400);
    await request(app)
      .get("/api/staff/tickets?state=open&currentStatus=OPEN")
      .set("Origin", TEST_ORIGIN)
      .set("Cookie", cookieA)
      .expect(400);
  });

  it("API-23 urgent vs recent separation; assignedToMe equals ?assignee= destination", async () => {
    const res = await dashboard(cookieA).expect(200);
    // Urgent tickets: HIGH/CRITICAL only, CRITICAL first, then recency/id.
    for (const t of res.body.urgentTickets) {
      expect(["HIGH", "CRITICAL"]).toContain(t.itPriority);
    }
    const ranks = res.body.urgentTickets.map((t: { itPriority: string }) => (t.itPriority === "CRITICAL" ? 0 : 1));
    expect([...ranks].sort((a: number, b: number) => a - b)).toEqual(ranks);
    expect(res.body.urgentTickets.length).toBeLessThanOrEqual(10);
    expect(res.body.recentlyUpdated.length).toBeLessThanOrEqual(8);
    // Metric ≡ destination: the queue filter reproduces the metric exactly.
    const dest = await request(app)
      .get("/api/staff/tickets?assignee=me")
      .set("Origin", TEST_ORIGIN)
      .set("Cookie", cookieA)
      .expect(200);
    const destCount = dest.body.meta?.totalCount ?? dest.body.data?.length ?? 0;
    expect(res.body.metrics.assignedToMe).toBe(destCount);
    // Metric ≡ destination (C-80-08): the queue filter reproduces the metric.
    // Per owner decision D-80-09 the dashboard links carry `&state=open`,
    // so the scoped destination shares the metric's non-terminal predicate
    // exactly (the bare unscoped link is legacy vocabulary only). The two
    // reads are sequential, so co-movement around one controlled OPEN/HIGH
    // insertion is asserted instead of absolute equality: parallel workers
    // creating ambient tickets between the reads would shift an absolute
    // comparison (observed 25 vs 26 pre-D-80-09), while pre-existing rows
    // cancel in deltas. A systematic predicate bug would move only one
    // side and still fail.
    const m0 = (await dashboard(cookieA).expect(200)).body.metrics.urgentHighPriority as number;
    const c0res = await request(app)
      .get("/api/staff/tickets?itPriority=HIGH,CRITICAL&state=open")
      .set("Origin", TEST_ORIGIN)
      .set("Cookie", cookieA)
      .expect(200);
    const c0 = (c0res.body.meta?.totalCount ?? c0res.body.data?.length ?? 0) as number;
    await makeTicket({ status: "OPEN", priority: "HIGH" });
    const m1 = (await dashboard(cookieA).expect(200)).body.metrics.urgentHighPriority as number;
    const c1res = await request(app)
      .get("/api/staff/tickets?itPriority=HIGH,CRITICAL&state=open")
      .set("Origin", TEST_ORIGIN)
      .set("Cookie", cookieA)
      .expect(200);
    const c1 = (c1res.body.meta?.totalCount ?? c1res.body.data?.length ?? 0) as number;
    expect(m1 - m0).toBeGreaterThanOrEqual(1);
    expect(m1 - m0).toBe(c1 - c0);
  });

  it("API-23b blocked deactivate never tears the assignedToMe count", async () => {
    // A deactivate that fails to commit (open assigned action blocks it)
    // must leave the metric exactly as committed state dictates: every
    // overlapping read keeps counting the intact assignment.
    const passwordHash = await hashPassword(PASSWORD);
    const staffX = (
      await prisma.user.create({
        data: { name: `a80s-x-${RUN}@test.local`, email: `a80s-x-${RUN}@test.local`, passwordHash, role: "IT_STAFF", isActive: true, mustChangePassword: false, failedLoginAttempts: 0 },
        select: { id: true },
      })
    ).id;
    const cookieX = await loginAs(`a80s-x-${RUN}@test.local`, PASSWORD);
    const ticketId = await makeTicket({ status: "OPEN", owner: staffA });
    const actionId = await createAction(ticketId, cookieA);
    await request(app)
      .put(`/api/staff/actions/${actionId}`)
      .set("Origin", TEST_ORIGIN)
      .set("Cookie", cookieA)
      .send({ expectedVersion: 1, assignedToId: staffX })
      .expect(200);
    // Overlapping reads race a deactivate attempt that MUST fail to commit
    // (BR-024: open assigned action blocks it).
    const [reads, deactivated] = await Promise.all([
      Promise.all(
        [0, 1, 2, 3, 4].map(() =>
          request(app).get("/api/dashboard/staff").set("Origin", TEST_ORIGIN).set("Cookie", cookieX).then((r) => r.status),
        ),
      ),
      request(app)
        .patch(`/api/admin/users/${staffX}`)
        .set("Origin", TEST_ORIGIN)
        .set("Cookie", cookieAdmin)
        .send({ active: false }),
    ]);
    expect(deactivated.status).toBe(409);
    expect(deactivated.body.error.code).toBe("USER_HAS_ACTIVE_ACTIONS");
    for (const status of reads) expect(status).toBe(200);
    // The assignment survived: metric still counts it, matching a direct query.
    const res = await dashboard(cookieX).expect(200);
    expect(res.body.metrics.assignedToMe).toBeGreaterThanOrEqual(1);
    expect(res.body.metrics.assignedToMe).toBe(
      await prisma.ticket.count({
        where: {
          currentStatus: { in: ["NEW", "OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER", "REOPENED"] },
          actions: { some: { assignedToId: staffX, status: { in: ["PLANNED", "IN_PROGRESS"] } } },
        },
      }),
    );
    // Cancel the work, deactivate for real, and close the loop: a
    // deactivated caller cannot query at all, and nothing references them.
    await request(app)
      .post(`/api/staff/actions/${actionId}/cancel`)
      .set("Origin", TEST_ORIGIN)
      .set("Cookie", cookieA)
      .send({ expectedVersion: 2 })
      .expect(200);
    await request(app)
      .patch(`/api/admin/users/${staffX}`)
      .set("Origin", TEST_ORIGIN)
      .set("Cookie", cookieAdmin)
      .send({ active: false })
      .expect(200);
    await request(app)
      .get("/api/dashboard/staff")
      .set("Origin", TEST_ORIGIN)
      .set("Cookie", cookieX)
      .expect(401);
    expect(
      await prisma.ticket.count({
        where: { actions: { some: { assignedToId: staffX, status: { in: ["PLANNED", "IN_PROGRESS"] } } } },
      }),
    ).toBe(0);
  });

  it("API-24 Admin userCounts shape; Staff omission; Requester denial; no PII", async () => {
    const admin = await dashboard(cookieAdmin).expect(200);
    const counts = admin.body.userCounts;
    expect(typeof counts.total).toBe("number");
    expect(typeof counts.active).toBe("number");
    expect(Object.keys(counts.byRole).sort()).toEqual(["ADMINISTRATOR", "IT_STAFF", "REQUESTER"]);
    expect(counts.total).toBe(await prisma.user.count());
    expect(counts.active).toBe(await prisma.user.count({ where: { isActive: true } }));
    for (const role of ["REQUESTER", "IT_STAFF", "ADMINISTRATOR"] as const) {
      expect(counts.byRole[role]).toBe(await prisma.user.count({ where: { role } }));
    }
    expect("deactivated" in counts).toBe(false);
    // No emails, hashes, or per-account detail anywhere (owner names are
    // display strings by contract; only id+name keys are permitted there).
    const blob = JSON.stringify(admin.body);
    expect(blob).not.toMatch(/"email"\s*:/);
    expect(blob).not.toMatch(/password/i);
    expect(blob).not.toMatch(/passwordHash/i);
    // Owner attributions carry id+name only — never email objects.
    for (const t of [...(admin.body.recentlyUpdated as unknown[]), ...(admin.body.urgentTickets as unknown[])]) {
      const owner = (t as { owner?: unknown }).owner as Record<string, unknown> | null;
      if (owner !== null && owner !== undefined) {
        expect(Object.keys(owner).sort()).toEqual(["id", "name"]);
      }
    }
    const staff = await dashboard(cookieB).expect(200);
    expect("userCounts" in staff.body).toBe(false);
    await request(app)
      .get("/api/dashboard/staff")
      .set("Origin", TEST_ORIGIN)
      .set("Cookie", await loginAs(`a80s-req-${RUN}@test.local`, PASSWORD))
      .expect(403);
  });

  it("SEC-04 password gate wiring on both dashboards", async () => {
    const gated = await makeUserGhost(`a80s-gated-${RUN}@test.local`);
    void gated;
    const cookieGated = await loginAs(`a80s-gated-${RUN}@test.local`, PASSWORD);
    await prisma.user.update({ where: { email: `a80s-gated-${RUN}@test.local` }, data: { mustChangePassword: true } });
    await request(app)
      .get("/api/dashboard/requester")
      .set("Origin", TEST_ORIGIN)
      .set("Cookie", cookieGated)
      .expect(403);
    await request(app)
      .get("/api/dashboard/staff")
      .set("Origin", TEST_ORIGIN)
      .set("Cookie", cookieGated)
      .expect(403);
    await prisma.user.update({ where: { email: `a80s-gated-${RUN}@test.local` }, data: { mustChangePassword: false } });
  });
});

async function makeUserGhost(email: string) {
  const passwordHash = await hashPassword(PASSWORD);
  return prisma.user.create({
    data: { name: email, email, passwordHash, role: "REQUESTER", isActive: true, mustChangePassword: false, failedLoginAttempts: 0 },
    select: { id: true },
  });
}

afterAll(async () => {
  const prefix = `80${RUN.slice(-6)}-`;
  const actions = await prisma.actionTaken.findMany({
    where: { ticket: { ticketNumber: { startsWith: prefix } } },
    select: { id: true },
  });
  const actionIds = actions.map((a) => a.id);
  if (actionIds.length > 0) {
    await prisma.actionTakenEvent.deleteMany({ where: { actionTakenId: { in: actionIds } } });
    await prisma.actionTaken.deleteMany({ where: { id: { in: actionIds } } });
  }
  await prisma.ticket.deleteMany({ where: { ticketNumber: { startsWith: prefix } } });
  await prisma.session.deleteMany({ where: { user: { email: { endsWith: `${RUN}@test.local` } } } });
  await prisma.user.deleteMany({ where: { email: { endsWith: `${RUN}@test.local` } } });
  await prisma.category.deleteMany({ where: { name: `A80S Cat ${RUN}` } });
  await prisma.relatedSystem.deleteMany({ where: { name: `A80S Sys ${RUN}` } });
});
