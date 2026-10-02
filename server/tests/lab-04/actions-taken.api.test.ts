import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import { hashPassword } from "../../src/lib/password-hash.js";
import { loginAs, TEST_ORIGIN } from "../helpers/auth-test.js";

// Issue #77 (Lab 4) — Actions Taken APIs (LAP4-01–LAP4-04, LAP4-08).
// Covers API-01–API-12b, SEC-01, SEC-04 with namespaced fixtures.
const PASSWORD = "Lab4-Foundation-9!";
const RUN = `a77-${Date.now().toString(36)}`;

const prisma = getPrisma();
let staffA = 0;
let staffB = 0;
let adminId = 0;
let requesterId = 0;
let requester2Id = 0;
let categoryId = 0;
let relatedSystemId = 0;
let cookieA = "";
let cookieB = "";
let cookieAdmin = "";
let cookieRequester = "";

let ticketSeq = 0;
async function makeTicket(
  requester: number,
  overrides: { currentStatus?: "NEW" | "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED" } = {},
): Promise<number> {
  ticketSeq += 1;
  const row = await prisma.ticket.create({
    data: {
      ticketNumber: `77${RUN.slice(-6)}-${String(1000 + ticketSeq)}`,
      requesterId: requester,
      categoryId,
      relatedSystemId,
      summary: `Foundation fixture ${RUN} #${ticketSeq}`,
      description: "Foundation fixture description body for action tests.",
      requestedPriority: "MEDIUM",
      itPriority: "MEDIUM",
      currentStatus: overrides.currentStatus ?? "OPEN",
      ticketOwnerId: null,
    },
    select: { id: true },
  });
  return row.id;
}

async function makeUser(email: string, role: "REQUESTER" | "IT_STAFF" | "ADMINISTRATOR", isActive: boolean) {
  const passwordHash = await hashPassword(PASSWORD);
  return prisma.user.create({
    data: {
      name: email,
      email,
      passwordHash,
      role,
      isActive,
      mustChangePassword: false,
      failedLoginAttempts: 0,
    },
    select: { id: true },
  });
}

function actionPayload(overrides: Record<string, unknown> = {}) {
  return {
    description: `Investigate outage ${RUN}`,
    clientRequestId: randomUUID(),
    ...overrides,
  };
}

let staffX = 0;
let reqX = 0;
let cookieX = "";
let reqCookie = "";

// File-level shared fixtures (D-02): every test in this file — including
// `-t` single-test runs that skip other describes' hooks — gets complete
// fixtures from this one hook. Describe-level beforeAll hooks are
// intentionally absent.
beforeAll(async () => {
  staffA = (await makeUser(`a77-staff-a-${RUN}@test.local`, "IT_STAFF", true)).id;
  staffB = (await makeUser(`a77-staff-b-${RUN}@test.local`, "IT_STAFF", true)).id;
  adminId = (await makeUser(`a77-admin-${RUN}@test.local`, "ADMINISTRATOR", true)).id;
  requesterId = (await makeUser(`a77-req-${RUN}@test.local`, "REQUESTER", true)).id;
  requester2Id = (await makeUser(`a77-req2-${RUN}@test.local`, "REQUESTER", true)).id;
  staffX = (await makeUser(`a77-staff-x-${RUN}@test.local`, "IT_STAFF", true)).id;
  reqX = (await makeUser(`a77-req-x-${RUN}@test.local`, "REQUESTER", true)).id;
  const cat = await prisma.category.create({ data: { name: `A77 Cat ${RUN}`, isActive: true } });
  const sys = await prisma.relatedSystem.create({ data: { name: `A77 Sys ${RUN}`, isActive: true } });
  categoryId = cat.id;
  relatedSystemId = sys.id;
  cookieA = await loginAs(`a77-staff-a-${RUN}@test.local`, PASSWORD);
  cookieB = await loginAs(`a77-staff-b-${RUN}@test.local`, PASSWORD);
  cookieAdmin = await loginAs(`a77-admin-${RUN}@test.local`, PASSWORD);
  cookieRequester = await loginAs(`a77-req-${RUN}@test.local`, PASSWORD);
  cookieX = await loginAs(`a77-staff-x-${RUN}@test.local`, PASSWORD);
  reqCookie = await loginAs(`a77-req-x-${RUN}@test.local`, PASSWORD);
  void adminId;
});

describe("Actions Taken APIs (Issue #77)", () => {
  afterAll(async () => {
    // File-level cleanup lives at the end of the file (after part 2).
  });

  it("API-01 staff creates a valid action; terminal parent rejected", async () => {
    const ticketId = await makeTicket(requesterId);
    const res = await request(app)
      .post(`/api/staff/tickets/${ticketId}/actions`)
      .set("Origin", TEST_ORIGIN)
      .set("Cookie", cookieA)
      .send(actionPayload({ assignedToId: staffB }))
      .expect(201);
    expect(res.body.status).toBe("PLANNED");
    expect(res.body.version).toBe(1);
    expect(res.body.recordedBy.id).toBe(staffA);
    expect(res.body.assignedTo.id).toBe(staffB);
    expect(res.body.cycle).toBe(1);
    const events = await prisma.actionTakenEvent.findMany({ where: { actionTakenId: res.body.id } });
    expect(events).toHaveLength(1);
    expect(events[0].eventType).toBe("CREATED");

    const resolvedId = await makeTicket(requesterId, { currentStatus: "RESOLVED" });
    await request(app)
      .post(`/api/staff/tickets/${resolvedId}/actions`)
      .set("Origin", TEST_ORIGIN)
      .set("Cookie", cookieA)
      .send(actionPayload())
      .expect(409);
    const count = await prisma.actionTaken.count({ where: { ticketId: resolvedId } });
    expect(count).toBe(0);
  });

  it("API-02 invalid bodies rejected without partial writes", async () => {
    const ticketId = await makeTicket(requesterId);
    const bad = [
      { ...actionPayload(), description: "   " },
      { ...actionPayload(), description: "x".repeat(1001) },
      { ...actionPayload(), followUpRequired: true },
      { ...actionPayload(), followUpRequired: true, followUpNote: "x".repeat(501) },
      { ...actionPayload(), actionDate: "1999-01-01T00:00:00.000Z" },
      { ...actionPayload(), actionDate: "2999-01-01T00:00:00.000Z" },
      { ...actionPayload(), assignedToId: 999999999 },
      { ...actionPayload(), recordedById: staffB },
      { ...actionPayload(), status: "COMPLETED" },
      { ...actionPayload(), clientRequestId: "not-a-uuid" },
      { ...actionPayload(), clientRequestId: undefined },
    ];
    for (const payload of bad) {
      const r = await request(app)
        .post(`/api/staff/tickets/${ticketId}/actions`)
        .set("Origin", TEST_ORIGIN)
        .set("Cookie", cookieA)
        .send(payload);
      expect([400, 409]).toContain(r.status);
    }
    // Out-of-range dates carry the specific contract code, never generic only.
    for (const badDate of ["1999-01-01T00:00:00.000Z", "2999-01-01T00:00:00.000Z"]) {
      const r = await request(app)
        .post(`/api/staff/tickets/${ticketId}/actions`)
        .set("Origin", TEST_ORIGIN)
        .set("Cookie", cookieA)
        .send(actionPayload({ actionDate: badDate }))
        .expect(400);
      expect(r.body.error.code).toBe("ACTION_DATE_OUT_OF_RANGE");
    }
    expect(await prisma.actionTaken.count({ where: { ticketId } })).toBe(0);
  });

  it("API-03 edit succeeds with version increments; stale and terminal rejected", async () => {
    const ticketId = await makeTicket(requesterId);
    const created = await request(app)
      .post(`/api/staff/tickets/${ticketId}/actions`)
      .set("Origin", TEST_ORIGIN)
      .set("Cookie", cookieA)
      .send(actionPayload())
      .expect(201);
    const id = created.body.id as number;
    const v1 = await request(app)
      .put(`/api/staff/actions/${id}`)
      .set("Origin", TEST_ORIGIN)
      .set("Cookie", cookieA)
      .send({ expectedVersion: 1, description: "Edited description here" })
      .expect(200);
    expect(v1.body.version).toBe(2);
    await request(app)
      .put(`/api/staff/actions/${id}`)
      .set("Origin", TEST_ORIGIN)
      .set("Cookie", cookieA)
      .send({ expectedVersion: 1, description: "Stale write attempt here" })
      .expect(409);
    // Terminal-ticket action is read-only even though the action itself is open.
    await prisma.ticket.update({ where: { id: ticketId }, data: { currentStatus: "CLOSED" } });
    await request(app)
      .put(`/api/staff/actions/${id}`)
      .set("Origin", TEST_ORIGIN)
      .set("Cookie", cookieA)
      .send({ expectedVersion: 2, description: "Edit on closed ticket here" })
      .expect(409);
  });

  it("API-04 start succeeds; skip/backward rejected; unknown enum is 400 (API-04b)", async () => {
    const ticketId = await makeTicket(requesterId);
    const created = await request(app)
      .post(`/api/staff/tickets/${ticketId}/actions`)
      .set("Origin", TEST_ORIGIN)
      .set("Cookie", cookieA)
      .send(actionPayload())
      .expect(201);
    const id = created.body.id as number;
    const started = await request(app)
      .put(`/api/staff/actions/${id}`)
      .set("Origin", TEST_ORIGIN)
      .set("Cookie", cookieA)
      .send({ expectedVersion: 1, status: "IN_PROGRESS" })
      .expect(200);
    expect(started.body.status).toBe("IN_PROGRESS");
    expect(started.body.version).toBe(2);
    await request(app)
      .put(`/api/staff/actions/${id}`)
      .set("Origin", TEST_ORIGIN)
      .set("Cookie", cookieA)
      .send({ expectedVersion: 2, status: "COMPLETED" })
      .expect(409);
    await request(app)
      .put(`/api/staff/actions/${id}`)
      .set("Origin", TEST_ORIGIN)
      .set("Cookie", cookieA)
      .send({ expectedVersion: 2, status: "BANANA" })
      .expect(400);
  });

  it("API-05 complete/cancel flows incl. empty body and follow-up at completion", async () => {
    const ticketId = await makeTicket(requesterId);
    const created = await request(app)
      .post(`/api/staff/tickets/${ticketId}/actions`)
      .set("Origin", TEST_ORIGIN)
      .set("Cookie", cookieA)
      .send(actionPayload())
      .expect(201);
    const id = created.body.id as number;
    await request(app)
      .post(`/api/staff/actions/${id}/complete`)
      .set("Origin", TEST_ORIGIN)
      .set("Cookie", cookieA)
      .send({})
      .expect(400);
    await request(app)
      .post(`/api/staff/actions/${id}/complete`)
      .set("Origin", TEST_ORIGIN)
      .set("Cookie", cookieA)
      .send({ expectedVersion: 1 })
      .expect(400);
    // Start first (complete requires IN_PROGRESS).
    await request(app)
      .put(`/api/staff/actions/${id}`)
      .set("Origin", TEST_ORIGIN)
      .set("Cookie", cookieA)
      .send({ expectedVersion: 1, status: "IN_PROGRESS" })
      .expect(200);
    const done = await request(app)
      .post(`/api/staff/actions/${id}/complete`)
      .set("Origin", TEST_ORIGIN)
      .set("Cookie", cookieB)
      .send({ expectedVersion: 2, result: "Fixed and verified.", followUpRequired: true, followUpNote: "Recheck tomorrow." })
      .expect(200);
    expect(done.body.status).toBe("COMPLETED");
    expect(done.body.version).toBe(3);
    // Recorder immutability (fix-review PR #83): a different-user completer
    // never mutates recordedById; the completer is the COMPLETED event actor.
    const stored = await prisma.actionTaken.findUniqueOrThrow({ where: { id } });
    expect(stored.recordedById).toBe(staffA);
    const completedEvent = await prisma.actionTakenEvent.findFirstOrThrow({
      where: { actionTakenId: id, eventType: "COMPLETED" },
    });
    expect(completedEvent.actorId).toBe(staffB);
    await request(app)
      .put(`/api/staff/actions/${id}`)
      .set("Origin", TEST_ORIGIN)
      .set("Cookie", cookieA)
      .send({ expectedVersion: 3, description: "Edit terminal action here" })
      .expect(409);

    const ticket2 = await makeTicket(requesterId);
    const c2 = await request(app)
      .post(`/api/staff/tickets/${ticket2}/actions`)
      .set("Origin", TEST_ORIGIN)
      .set("Cookie", cookieA)
      .send(actionPayload())
      .expect(201);
    const cancelled = await request(app)
      .post(`/api/staff/actions/${c2.body.id}/cancel`)
      .set("Origin", TEST_ORIGIN)
      .set("Cookie", cookieA)
      .send({ expectedVersion: 1 })
      .expect(200);
    expect(cancelled.body.status).toBe("CANCELLED");
  });

  it("API-06 inactive assignee rejected; recorder-accountable path succeeds", async () => {
    const inactive = await makeUser(`a77-inactive-${RUN}@test.local`, "IT_STAFF", false);
    const ticketId = await makeTicket(reqX);
    const ineligible = await request(app)
      .post(`/api/staff/tickets/${ticketId}/actions`)
      .set("Origin", TEST_ORIGIN)
      .set("Cookie", cookieX)
      .send(actionPayload({ assignedToId: inactive.id }))
      .expect(409);
    expect(ineligible.body.error.code).toBe("ACTION_ASSIGNEE_NOT_ELIGIBLE");
    const res = await request(app)
      .post(`/api/staff/tickets/${ticketId}/actions`)
      .set("Origin", TEST_ORIGIN)
      .set("Cookie", cookieA)
      .send(actionPayload())
      .expect(201);
    expect(res.body.assignedTo).toBeNull();
    await request(app)
      .put(`/api/staff/actions/${res.body.id}`)
      .set("Origin", TEST_ORIGIN)
      .set("Cookie", cookieA)
      .send({ expectedVersion: 1, status: "IN_PROGRESS" })
      .expect(200);
    const done = await request(app)
      .post(`/api/staff/actions/${res.body.id}/complete`)
      .set("Origin", TEST_ORIGIN)
      .set("Cookie", cookieB)
      .send({ expectedVersion: 2, result: "Done by recorder-accountable path." })
      .expect(200);
    expect(done.body.status).toBe("COMPLETED");
  });
});

describe("Actions Taken history, idempotency, concurrency, security (Issue #77, part 2)", () => {
  // Fixtures come from the file-level beforeAll above (D-02).

  it("API-09 idempotency: identical replay, divergent conflict, per-ticket scope, missing key", async () => {
    const ticketId = await makeTicket(reqX);
    const key = randomUUID();
    // Explicit stamp safely inside [ticketDate, now+1h]: captured after
    // ticket creation plus margin, so ms-level clock granularity can never
    // push it below ticketDate. Identical stamp on retry proves replay.
    const stamp = new Date(Date.now() + 5000).toISOString();
    const first = await request(app)
      .post(`/api/staff/tickets/${ticketId}/actions`)
      .set("Origin", TEST_ORIGIN)
      .set("Cookie", cookieX)
      .send(actionPayload({ description: "Idempotent work item", clientRequestId: key, actionDate: stamp }))
      .expect(201);
    const replay = await request(app)
      .post(`/api/staff/tickets/${ticketId}/actions`)
      .set("Origin", TEST_ORIGIN)
      .set("Cookie", cookieX)
      .send(actionPayload({ description: "Idempotent work item", clientRequestId: key, actionDate: stamp }))
      .expect(200);
    expect(replay.headers["idempotent-replayed"]).toBe("true");
    expect(replay.body.id).toBe(first.body.id);
    expect(await prisma.actionTakenEvent.count({ where: { actionTakenId: first.body.id } })).toBe(1);
    await request(app)
      .post(`/api/staff/tickets/${ticketId}/actions`)
      .set("Origin", TEST_ORIGIN)
      .set("Cookie", cookieX)
      .send(actionPayload({ description: "Different intent entirely", clientRequestId: key, actionDate: stamp }))
      .expect(409);
    // Omitted-date retry replays the original (AUTO_NOW sentinel): same key,
    // same other fields, no asserted date → 200 + Idempotent-Replayed,
    // never a duplicate, never a new event.
    const omittedReplay = await request(app)
      .post(`/api/staff/tickets/${ticketId}/actions`)
      .set("Origin", TEST_ORIGIN)
      .set("Cookie", cookieX)
      .send(actionPayload({ description: "Idempotent work item", clientRequestId: key }))
      .expect(200);
    expect(omittedReplay.headers["idempotent-replayed"]).toBe("true");
    expect(omittedReplay.body.id).toBe(first.body.id);
    expect(await prisma.actionTaken.count({ where: { ticketId, clientRequestId: key } })).toBe(1);
    expect(await prisma.actionTakenEvent.count({ where: { actionTakenId: first.body.id } })).toBe(1);
    // The date wildcard must not swallow real divergence: omitted date with
    // different other fields still conflicts.
    await request(app)
      .post(`/api/staff/tickets/${ticketId}/actions`)
      .set("Origin", TEST_ORIGIN)
      .set("Cookie", cookieX)
      .send(actionPayload({ description: "Different intent, no date", clientRequestId: key }))
      .expect(409);
    expect(await prisma.actionTaken.count({ where: { ticketId, clientRequestId: key } })).toBe(1);
    // Same key on another ticket is a different scope.
    const other = await makeTicket(reqX);
    await request(app)
      .post(`/api/staff/tickets/${other}/actions`)
      .set("Origin", TEST_ORIGIN)
      .set("Cookie", cookieX)
      .send(actionPayload({ description: "Idempotent work item", clientRequestId: key }))
      .expect(201);
    // Concurrent same-key inserts yield exactly one logical action.
    // (a) Explicit identical stamp: deterministic replay mix.
    const raceKey = randomUUID();
    const raceStamp = new Date(Date.now() + 5000).toISOString();
    const raced = await Promise.all(
      [0, 1, 2].map(() =>
        request(app)
          .post(`/api/staff/tickets/${ticketId}/actions`)
          .set("Origin", TEST_ORIGIN)
          .set("Cookie", cookieX)
          .send(actionPayload({ description: "Raced intent", clientRequestId: raceKey, actionDate: raceStamp })),
      ),
    );
    expect(raced.map((r) => r.status).sort()).toEqual([200, 200, 201]);
    expect(await prisma.actionTaken.count({ where: { ticketId, clientRequestId: raceKey } })).toBe(1);
    // (b) Auto-now race: instants can collide at ms precision, so pin only
    // what is deterministic — exactly one row, exactly one 201, never 500.
    const raceKey2 = randomUUID();
    const raced2 = await Promise.all(
      [0, 1, 2].map(() =>
        request(app)
          .post(`/api/staff/tickets/${ticketId}/actions`)
          .set("Origin", TEST_ORIGIN)
          .set("Cookie", cookieX)
          .send(actionPayload({ description: "Raced auto intent", clientRequestId: raceKey2 })),
      ),
    );
    const s2 = raced2.map((r) => r.status);
    expect(s2.filter((s) => s === 201)).toHaveLength(1);
    for (const s of s2) expect([200, 201, 409]).toContain(s);
    expect(await prisma.actionTaken.count({ where: { ticketId, clientRequestId: raceKey2 } })).toBe(1);
    // Distinct keys concurrently: every create persists independently.
    const distinct = await Promise.all(
      [0, 1, 2].map((i) =>
        request(app)
          .post(`/api/staff/tickets/${ticketId}/actions`)
          .set("Origin", TEST_ORIGIN)
          .set("Cookie", cookieX)
          .send(actionPayload({ description: `Distinct intent ${i}`, clientRequestId: randomUUID() })),
      ),
    );
    expect(distinct.map((r) => r.status)).toEqual([201, 201, 201]);
  });

  it("API-10/11/12 history: ordered events, no mutation routes, deterministic order", async () => {
    const ticketId = await makeTicket(reqX);
    const created = await request(app)
      .post(`/api/staff/tickets/${ticketId}/actions`)
      .set("Origin", TEST_ORIGIN)
      .set("Cookie", cookieX)
      .send(actionPayload({ description: "History probe", followUpRequired: true, followUpNote: "Watch it." }))
      .expect(201);
    const id = created.body.id as number;
    await request(app)
      .put(`/api/staff/actions/${id}`)
      .set("Origin", TEST_ORIGIN)
      .set("Cookie", cookieX)
      .send({ expectedVersion: 1, description: "History probe edited", assignedToId: staffX, followUpRequired: false, status: "IN_PROGRESS" })
      .expect(200);
    const list = await request(app)
      .get(`/api/staff/actions/${id}/events`)
      .set("Cookie", cookieX)
      .expect(200);
    const types = (list.body.events as { eventType: string }[]).map((e) => e.eventType);
    expect(types).toEqual(["CREATED", "STATUS_CHANGED", "ASSIGNED", "FOLLOW_UP_CHANGED", "UPDATED"]);
    const times = (list.body.events as { occurredAt: string; id: number }[]).map((e) => e.occurredAt + "#" + e.id);
    expect([...times].sort()).toEqual(times);
    for (const e of list.body.events as { actor: { id: number } }[]) {
      expect(e.actor.id).toBe(staffX);
    }
    // No update/delete event routes exist.
    await request(app).put(`/api/staff/actions/${id}/events`).set("Cookie", cookieX).send({}).expect(404);
    await request(app).delete(`/api/staff/actions/${id}/events`).set("Cookie", cookieX).expect(404);
  });

  it("API-12b history survives across cycles with order intact", async () => {
    const ticketId = await makeTicket(reqX);
    const created = await request(app)
      .post(`/api/staff/tickets/${ticketId}/actions`)
      .set("Origin", TEST_ORIGIN)
      .set("Cookie", cookieX)
      .send(actionPayload({ description: "Cross-cycle probe" }))
      .expect(201);
    const before = await request(app)
      .get(`/api/staff/actions/${created.body.id}/events`)
      .set("Cookie", cookieX)
      .expect(200);
    expect((before.body.events as unknown[]).length).toBeGreaterThan(0);
    // Simulate a cycle change at the data layer (reopen logic lands in Issue 28);
    // history must remain byte-identical and ordered.
    await prisma.ticket.update({ where: { id: ticketId }, data: { resolutionCycle: 2 } });
    const after = await request(app)
      .get(`/api/staff/actions/${created.body.id}/events`)
      .set("Cookie", cookieX)
      .expect(200);
    expect(after.body).toEqual(before.body);
  });

  it("API-07 assign races deactivate; API-07b terminal-only history never blocks", async () => {
    const target = await makeUser(`a77-race-${RUN}@test.local`, "IT_STAFF", true);
    const ticketId = await makeTicket(reqX);
    const created = await request(app)
      .post(`/api/staff/tickets/${ticketId}/actions`)
      .set("Origin", TEST_ORIGIN)
      .set("Cookie", cookieX)
      .send(actionPayload({ description: "Race probe", assignedToId: target.id }))
      .expect(201);
    const actionId = created.body.id as number;
    const [assignRes, deactivateRes] = await Promise.all([
      request(app)
        .put(`/api/staff/actions/${actionId}`)
        .set("Origin", TEST_ORIGIN)
        .set("Cookie", cookieX)
        .send({ expectedVersion: 1, description: "Race probe reassigned", assignedToId: target.id }),
      request(app)
        .patch(`/api/admin/users/${target.id}`)
        .set("Origin", TEST_ORIGIN)
        .set("Cookie", cookieAdmin)
        .send({ active: false }),
    ]);
    // Row-lock serialization guarantees exactly one loser: well-formed
    // requests can only yield 200 or 409 here (422 is forbidden by contract).
    expect([200, 409]).toContain(assignRes.status);
    expect([200, 409]).toContain(deactivateRes.status);
    const sorted = [assignRes.status, deactivateRes.status].sort();
    expect(sorted).toEqual([200, 409]);
    // Final-state proof per winner.
    const freshTarget = await prisma.user.findUnique({ where: { id: target.id } });
    const freshAction = await prisma.actionTaken.findUnique({ where: { id: actionId } });
    if (deactivateRes.status === 200) {
      // Deactivate won: target inactive; the pre-existing assignment is
      // frozen history (no new ineligible state was committed).
      expect(freshTarget?.isActive).toBe(false);
      expect(assignRes.body.error.code).toBe("ACTION_ASSIGNEE_NOT_ELIGIBLE");
    } else {
      // Assign won: target still active and still the assignee.
      expect(freshTarget?.isActive).toBe(true);
      expect(freshAction?.assignedToId).toBe(target.id);
      expect(deactivateRes.body.error.code).toBe("USER_HAS_ACTIVE_ACTIONS");
    }
    // COMPLETED-only user deactivation passes (use the seeded completed action owner path).
    const solo = await makeUser(`a77-solo-${RUN}@test.local`, "IT_STAFF", true);
    const t2 = await makeTicket(reqX);
    const a2 = await request(app)
      .post(`/api/staff/tickets/${t2}/actions`)
      .set("Origin", TEST_ORIGIN)
      .set("Cookie", cookieX)
      .send(actionPayload({ description: "Solo probe", assignedToId: solo.id }))
      .expect(201);
    await request(app)
      .put(`/api/staff/actions/${a2.body.id}`)
      .set("Origin", TEST_ORIGIN)
      .set("Cookie", cookieX)
      .send({ expectedVersion: 1, status: "IN_PROGRESS" })
      .expect(200);
    await request(app)
      .post(`/api/staff/actions/${a2.body.id}/complete`)
      .set("Origin", TEST_ORIGIN)
      .set("Cookie", cookieX)
      .send({ expectedVersion: 2, result: "All done." })
      .expect(200);
    const deact = await request(app)
      .patch(`/api/admin/users/${solo.id}`)
      .set("Origin", TEST_ORIGIN)
      .set("Cookie", cookieAdmin)
      .send({ active: false });
    expect([200, 204]).toContain(deact.status);
    // Full predicate matrix: open actions on CLOSED and RESOLVED tickets
    // never block (inserted directly — the API itself refuses to create
    // them there), while an open action on an OPEN ticket blocks.
    const frozen = await makeUser(`a77-frozen-${RUN}@test.local`, "IT_STAFF", true);
    for (const status of ["CLOSED", "RESOLVED"] as const) {
      const ft = await makeTicket(reqX, { currentStatus: status });
      await prisma.actionTaken.create({
        data: {
          ticketId: ft,
          description: `Frozen ${status} probe`,
          recordedById: staffX,
          assignedToId: frozen.id,
          actionDate: new Date(),
          status: "PLANNED",
          cycle: 1,
          version: 1,
          clientRequestId: randomUUID(),
        },
      });
    }
    const deactFrozen = await request(app)
      .patch(`/api/admin/users/${frozen.id}`)
      .set("Origin", TEST_ORIGIN)
      .set("Cookie", cookieAdmin)
      .send({ active: false });
    expect([200, 204]).toContain(deactFrozen.status);
  });

  it("API-20 stale-version concurrent edits: exactly one winner", async () => {
    const ticketId = await makeTicket(reqX);
    const created = await request(app)
      .post(`/api/staff/tickets/${ticketId}/actions`)
      .set("Origin", TEST_ORIGIN)
      .set("Cookie", cookieX)
      .send(actionPayload({ description: "Version race probe" }))
      .expect(201);
    const id = created.body.id as number;
    const results = await Promise.all(
      [0, 1, 2].map((i) =>
        request(app)
          .put(`/api/staff/actions/${id}`)
          .set("Origin", TEST_ORIGIN)
          .set("Cookie", cookieX)
          .send({ expectedVersion: 1, description: `Racer ${i} write here` }),
      ),
    );
    const okCount = results.filter((r) => r.status === 200).length;
    const conflictCount = results.filter((r) => r.status === 409).length;
    expect(okCount).toBe(1);
    expect(conflictCount).toBe(2);
    const fresh = await prisma.actionTaken.findUnique({ where: { id } });
    expect(fresh?.version).toBe(2);
  });

  it("API-08 + SEC-01 + SEC-04: requester isolation, matrix, password gate", async () => {
    const ticketId = await makeTicket(reqX);
    // Requester reads owned list.
    const list = await request(app)
      .get(`/api/tickets/${ticketId}/actions`)
      .set("Cookie", reqCookie)
      .expect(200);
    expect(Array.isArray(list.body.actions)).toBe(true);
    // Requester mutations denied.
    await request(app)
      .post(`/api/staff/tickets/${ticketId}/actions`)
      .set("Origin", TEST_ORIGIN)
      .set("Cookie", reqCookie)
      .send(actionPayload())
      .expect(403);
    const created = await request(app)
      .post(`/api/staff/tickets/${ticketId}/actions`)
      .set("Origin", TEST_ORIGIN)
      .set("Cookie", cookieX)
      .send(actionPayload({ description: "SEC probe" }))
      .expect(201);
    await request(app)
      .put(`/api/staff/actions/${created.body.id}`)
      .set("Origin", TEST_ORIGIN)
      .set("Cookie", reqCookie)
      .send({ expectedVersion: 1, description: "Requester edit attempt" })
      .expect(403);
    await request(app)
      .get(`/api/staff/actions/${created.body.id}/events`)
      .set("Cookie", reqCookie)
      .expect(403);
    // Cross-requester ticket hidden.
    const otherCookie = await loginAs(`a77-req2-${RUN}@test.local`, PASSWORD);
    await request(app).get(`/api/tickets/${ticketId}/actions`).set("Cookie", otherCookie).expect(404);
    // Password-gated user gets 403 on new endpoints (Lab 3 baseline split).
    const gated = await makeUser(`a77-gated-${RUN}@test.local`, "IT_STAFF", true);
    await prisma.user.update({ where: { id: gated.id }, data: { mustChangePassword: true } });
    const loginRes = await request(app)
      .post("/api/auth/login")
      .set("Origin", TEST_ORIGIN)
      .send({ email: `a77-gated-${RUN}@test.local`, password: PASSWORD });
    expect(loginRes.status).toBe(200);
    const gatedCookie = sessionCookieValue(loginRes.headers["set-cookie"]);
    expect(gatedCookie).toBeDefined();
    await request(app)
      .get(`/api/tickets/${ticketId}/actions`)
      .set("Cookie", gatedCookie as string)
      .expect(403);
    await request(app)
      .post(`/api/staff/tickets/${ticketId}/actions`)
      .set("Origin", TEST_ORIGIN)
      .set("Cookie", gatedCookie as string)
      .send(actionPayload())
      .expect(403);
    // Full matrix: every other new endpoint enforces the same gate.
    const probe = await request(app)
      .post(`/api/staff/tickets/${ticketId}/actions`)
      .set("Origin", TEST_ORIGIN)
      .set("Cookie", cookieX)
      .send(actionPayload({ description: "Gate matrix probe" }))
      .expect(201);
    const probeId = probe.body.id as number;
    await request(app)
      .put(`/api/staff/actions/${probeId}`)
      .set("Origin", TEST_ORIGIN)
      .set("Cookie", gatedCookie as string)
      .send({ expectedVersion: 1, description: "Gated edit attempt here" })
      .expect(403);
    await request(app)
      .post(`/api/staff/actions/${probeId}/cancel`)
      .set("Origin", TEST_ORIGIN)
      .set("Cookie", gatedCookie as string)
      .send({ expectedVersion: 1 })
      .expect(403);
    await request(app)
      .post(`/api/staff/actions/${probeId}/complete`)
      .set("Origin", TEST_ORIGIN)
      .set("Cookie", gatedCookie as string)
      .send({ expectedVersion: 1, result: "Gated complete attempt." })
      .expect(403);
    await request(app)
      .get(`/api/staff/actions/${probeId}/events`)
      .set("Cookie", gatedCookie as string)
      .expect(403);
    await request(app)
      .get(`/api/tickets/${ticketId}/actions/${probeId}/events`)
      .set("Cookie", gatedCookie as string)
      .expect(403);
    // Unauthenticated callers get 401, never the gate code.
    await request(app).get(`/api/tickets/${ticketId}/actions`).expect(401);
    await request(app)
      .post(`/api/staff/tickets/${ticketId}/actions`)
      .set("Origin", TEST_ORIGIN)
      .send(actionPayload())
      .expect(401);
    // No user hard-delete route exists (SET NULL can never fire from the API).
    await request(app)
      .delete(`/api/admin/users/${staffX}`)
      .set("Cookie", cookieAdmin)
      .expect(404);
  });

  function sessionCookieValue(setCookie: unknown): string | undefined {
    const cookies: string[] = Array.isArray(setCookie)
      ? (setCookie as string[])
      : setCookie
        ? [setCookie as string]
        : [];
    const found = cookies.find((c) => c.startsWith("toktickit_session="));
    if (!found) return undefined;
    return found.split(";")[0];
  }
});

afterAll(async () => {
  const prefix = `77${RUN.slice(-6)}-`;
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
  await prisma.category.deleteMany({ where: { name: `A77 Cat ${RUN}` } });
  await prisma.relatedSystem.deleteMany({ where: { name: `A77 Sys ${RUN}` } });
});
