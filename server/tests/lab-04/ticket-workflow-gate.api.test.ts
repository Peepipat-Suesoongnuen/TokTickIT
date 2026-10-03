import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import { hashPassword } from "../../src/lib/password-hash.js";
import { loginAs, TEST_ORIGIN } from "../helpers/auth-test.js";

// Issue #79 (Lab 4) — Ticket workflow + resolution gate (LAP4-05).
// Covers UNIT-02 (lib), API-13–17/19/25/25b; UI-04 is covered client-side.
const PASSWORD = "Lab4-Gate-79!";
const RUN = `a79-${Date.now().toString(36)}`;

const prisma = getPrisma();
let staffA = 0;
let requesterId = 0;
let categoryId = 0;
let relatedSystemId = 0;
let cookieA = "";

let ticketSeq = 0;
async function makeTicket(
  status: "OPEN" | "IN_PROGRESS" | "WAITING_FOR_REQUESTER" | "RESOLVED" | "CLOSED" = "IN_PROGRESS",
): Promise<number> {
  ticketSeq += 1;
  const row = await prisma.ticket.create({
    data: {
      ticketNumber: `79${RUN.slice(-6)}-${String(1000 + ticketSeq)}`,
      requesterId,
      categoryId,
      relatedSystemId,
      summary: `Gate fixture ${RUN} #${ticketSeq}`,
      description: "Gate fixture description body.",
      requestedPriority: "MEDIUM",
      itPriority: "MEDIUM",
      currentStatus: status,
      ticketOwnerId: staffA,
    },
    select: { id: true },
  });
  return row.id;
}

async function setStatus(ticketId: number, status: string, expected: string) {
  return request(app)
    .patch(`/api/staff/tickets/${ticketId}/status`)
    .set("Origin", TEST_ORIGIN)
    .set("Cookie", cookieA)
    .send({ status, expectedCurrentStatus: expected });
}

async function createAction(ticketId: number, status: "PLANNED" | "IN_PROGRESS" = "PLANNED") {
  const created = await request(app)
    .post(`/api/staff/tickets/${ticketId}/actions`)
    .set("Origin", TEST_ORIGIN)
    .set("Cookie", cookieA)
    .send({ description: `Gate work ${RUN}`, clientRequestId: randomUUID() })
    .expect(201);
  if (status === "IN_PROGRESS") {
    await request(app)
      .put(`/api/staff/actions/${created.body.id}`)
      .set("Origin", TEST_ORIGIN)
      .set("Cookie", cookieA)
      .send({ expectedVersion: 1, status: "IN_PROGRESS" })
      .expect(200);
  }
  return created.body.id as number;
}

async function completeAction(actionId: number, version: number, result = "Gate work verified.") {
  return request(app)
    .post(`/api/staff/actions/${actionId}/complete`)
    .set("Origin", TEST_ORIGIN)
    .set("Cookie", cookieA)
    .send({ expectedVersion: version, result });
}

beforeAll(async () => {
  const passwordHash = await hashPassword(PASSWORD);
  staffA = (
    await prisma.user.create({
      data: { name: `a79-staff-${RUN}`, email: `a79-staff-${RUN}@test.local`, passwordHash, role: "IT_STAFF", isActive: true, mustChangePassword: false, failedLoginAttempts: 0 },
      select: { id: true },
    })
  ).id;
  requesterId = (
    await prisma.user.create({
      data: { name: `a79-req-${RUN}`, email: `a79-req-${RUN}@test.local`, passwordHash, role: "REQUESTER", isActive: true, mustChangePassword: false, failedLoginAttempts: 0 },
      select: { id: true },
    })
  ).id;
  categoryId = (await prisma.category.create({ data: { name: `A79 Cat ${RUN}`, isActive: true }, select: { id: true } })).id;
  relatedSystemId = (await prisma.relatedSystem.create({ data: { name: `A79 Sys ${RUN}`, isActive: true }, select: { id: true } })).id;
  cookieA = await loginAs(`a79-staff-${RUN}@test.local`, PASSWORD);
});

describe("Ticket workflow gate (Issue #79, LAP4-05)", () => {
  it("API-13 resolve with a non-terminal action fails closed with openActionIds", async () => {
    const ticketId = await makeTicket();
    const doneId = await createAction(ticketId, "IN_PROGRESS");
    await completeAction(doneId, 2).then((r) => expect(r.status).toBe(200));
    const actionId = await createAction(ticketId, "IN_PROGRESS");
    const res = await setStatus(ticketId, "RESOLVED", "IN_PROGRESS");
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("RESOLUTION_BLOCKED_BY_OPEN_ACTIONS");
    expect(res.body.error.openActionIds).toEqual([actionId]);
    const ticket = await prisma.ticket.findUniqueOrThrow({ where: { id: ticketId } });
    expect(ticket.currentStatus).toBe("IN_PROGRESS");
    const action = await prisma.actionTaken.findUniqueOrThrow({ where: { id: actionId } });
    expect(action.status).toBe("IN_PROGRESS");
    expect(action.version).toBe(2);
  });

  it("API-14 resolve with zero completions fails with currentCycle", async () => {
    const ticketId = await makeTicket();
    const res = await setStatus(ticketId, "RESOLVED", "IN_PROGRESS");
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("RESOLUTION_REQUIRES_COMPLETED_ACTION");
    expect(res.body.error.currentCycle).toBe(1);
  });

  it("API-15 resolve after a current-cycle completion succeeds per matrix", async () => {
    const ticketId = await makeTicket();
    const actionId = await createAction(ticketId, "IN_PROGRESS");
    await completeAction(actionId, 2).then((r) => expect(r.status).toBe(200));
    const res = await setStatus(ticketId, "RESOLVED", "IN_PROGRESS");
    expect(res.status).toBe(200);
  });

  it("API-16 legacy zero-action tickets must earn one completion first", async () => {
    const ticketId = await makeTicket("OPEN");
    await setStatus(ticketId, "IN_PROGRESS", "OPEN").then((r) => expect(r.status).toBe(200));
    const blocked = await setStatus(ticketId, "RESOLVED", "IN_PROGRESS");
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe("RESOLUTION_REQUIRES_COMPLETED_ACTION");
    const actionId = await createAction(ticketId, "IN_PROGRESS");
    await completeAction(actionId, 2).then((r) => expect(r.status).toBe(200));
    await setStatus(ticketId, "RESOLVED", "IN_PROGRESS").then((r) => expect(r.status).toBe(200));
  });

  it("API-17 reopen starts a new cycle; old completions never satisfy the new gate", async () => {
    const ticketId = await makeTicket();
    const actionId = await createAction(ticketId, "IN_PROGRESS");
    await completeAction(actionId, 2).then((r) => expect(r.status).toBe(200));
    await setStatus(ticketId, "RESOLVED", "IN_PROGRESS").then((r) => expect(r.status).toBe(200));
    await prisma.ticket.update({ where: { id: ticketId }, data: { requesterResolutionIndicatedAt: new Date() } });
    const reopened = await setStatus(ticketId, "REOPENED", "RESOLVED");
    expect(reopened.status).toBe(200);
    expect(reopened.body.currentCycle).toBe(2);
    const after = await prisma.ticket.findUniqueOrThrow({ where: { id: ticketId } });
    expect(after.currentStatus).toBe("REOPENED");
    expect(after.resolutionCycle).toBe(2);
    expect(after.requesterResolutionIndicatedAt).toBeNull();
    // Old-cycle completion must not satisfy the new gate.
    const bare = await setStatus(ticketId, "RESOLVED", "REOPENED");
    expect(bare.status).toBe(409);
    // New-cycle work re-arms the gate (via IN_PROGRESS first per matrix).
    await setStatus(ticketId, "IN_PROGRESS", "REOPENED").then((r) => expect(r.status).toBe(200));
    const action2 = await createAction(ticketId, "IN_PROGRESS");
    await completeAction(action2, 2).then((r) => expect(r.status).toBe(200));
    await setStatus(ticketId, "RESOLVED", "IN_PROGRESS").then((r) => expect(r.status).toBe(200));
  });

  it("API-19 overlapping resolve and complete never bypass the gate", async () => {
    const ticketId = await makeTicket();
    const actionId = await createAction(ticketId, "IN_PROGRESS");
    const [resolveRes, completeRes] = await Promise.all([
      setStatus(ticketId, "RESOLVED", "IN_PROGRESS"),
      completeAction(actionId, 2),
    ]);
    const codes = [resolveRes.status, completeRes.status].sort();
    // Either the completion lands first (resolve then succeeds) or the
    // resolve lands first (completion 409s on the frozen ticket). Both are
    // valid; a bypass (resolved ticket with an open same-cycle action) is not.
    expect([[200, 200], [200, 409]]).toContainEqual(codes);
    const ticket = await prisma.ticket.findUniqueOrThrow({ where: { id: ticketId } });
    const action = await prisma.actionTaken.findUniqueOrThrow({ where: { id: actionId } });
    if (ticket.currentStatus === "RESOLVED") {
      expect(["COMPLETED", "IN_PROGRESS"]).toContain(action.status);
      if (action.status === "IN_PROGRESS") {
        // Resolve won while the action was still open: impossible — the gate
        // reads the same-cycle actions atomically. Reaching here is a bypass.
        expect.unreachable("RESOLVED ticket holds an open same-cycle action");
      }
    } else {
      expect(ticket.currentStatus).toBe("IN_PROGRESS");
      expect(action.status).toBe("COMPLETED");
    }
  });

  it("API-25 concurrent reopens increment exactly once; API-25b rollbacks leave no gaps", async () => {
    const ticketId = await makeTicket("RESOLVED");
    const results = await Promise.all([
      setStatus(ticketId, "REOPENED", "RESOLVED"),
      setStatus(ticketId, "REOPENED", "RESOLVED"),
      setStatus(ticketId, "REOPENED", "RESOLVED"),
    ]);
    const winners = results.filter((r) => r.status === 200);
    const losers = results.filter((r) => r.status === 409);
    expect(winners).toHaveLength(1);
    expect(losers).toHaveLength(2);
    expect(winners[0].body.currentCycle).toBe(2);
    const ticket = await prisma.ticket.findUniqueOrThrow({ where: { id: ticketId } });
    expect(ticket.currentStatus).toBe("REOPENED");
    // Losers rolled back: the counter advanced exactly once, never gapped.
    expect(ticket.resolutionCycle).toBe(2);
  });
});

afterAll(async () => {
  const prefix = `79${RUN.slice(-6)}-`;
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
  await prisma.category.deleteMany({ where: { name: `A79 Cat ${RUN}` } });
  await prisma.relatedSystem.deleteMany({ where: { name: `A79 Sys ${RUN}` } });
});
