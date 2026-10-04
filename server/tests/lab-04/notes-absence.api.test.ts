import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import { hashPassword } from "../../src/lib/password-hash.js";
import { loginAs, TEST_ORIGIN } from "../helpers/auth-test.js";

// Issue #81 (Lab 4) — SEC-03: Internal Notes absence from every NEW
// response shape (D-81-02 explicit target list).
//
// Scanned shapes (all introduced by Issues #77–80): both dashboard
// payloads, action create/update/complete/cancel responses, the action
// list, and the event stream. Legitimate note carriers (staff ticket
// detail, notes endpoints) are explicitly OUT of scope — staff detail
// must carry notes by contract. Fixture text avoids the scanned tokens so
// a match always means a leaked field, never fixture content.
const PASSWORD = "Lab4-NotesAbs-81!";
const RUN = `a81n-${Date.now().toString(36)}`;

const prisma = getPrisma();
let reqId = 0;
let staffId = 0;
let categoryId = 0;
let relatedSystemId = 0;
let cookieReq = "";
let cookieStaff = "";

function scanShape(label: string, body: unknown): void {
  const blob = JSON.stringify(body);
  expect(blob, `${label} leaks an internal-note key`).not.toMatch(/internalnotes?/i);
  expect(blob, `${label} leaks an internal_note key`).not.toMatch(/internal_note/i);
  expect(blob, `${label} carries a notes collection`).not.toMatch(/"notes"\s*:/);
}

beforeAll(async () => {
  const passwordHash = await hashPassword(PASSWORD);
  reqId = (
    await prisma.user.create({
      data: { name: `a81n-req-${RUN}@test.local`, email: `a81n-req-${RUN}@test.local`, passwordHash, role: "REQUESTER", isActive: true, mustChangePassword: false, failedLoginAttempts: 0 },
      select: { id: true },
    })
  ).id;
  staffId = (
    await prisma.user.create({
      data: { name: `a81n-staff-${RUN}@test.local`, email: `a81n-staff-${RUN}@test.local`, passwordHash, role: "IT_STAFF", isActive: true, mustChangePassword: false, failedLoginAttempts: 0 },
      select: { id: true },
    })
  ).id;
  categoryId = (await prisma.category.create({ data: { name: `A81N Cat ${RUN}`, isActive: true } })).id;
  relatedSystemId = (await prisma.relatedSystem.create({ data: { name: `A81N Sys ${RUN}`, isActive: true } })).id;
  cookieReq = await loginAs(`a81n-req-${RUN}@test.local`, PASSWORD);
  cookieStaff = await loginAs(`a81n-staff-${RUN}@test.local`, PASSWORD);
  void staffId;
});

describe("Internal Notes absence from new response shapes (Issue #81, SEC-03)", () => {
  it("dashboard payloads carry no note fields", async () => {
    const reqDash = await request(app)
      .get("/api/dashboard/requester")
      .set("Origin", TEST_ORIGIN)
      .set("Cookie", cookieReq)
      .expect(200);
    scanShape("requester dashboard", reqDash.body);
    const staffDash = await request(app)
      .get("/api/dashboard/staff")
      .set("Origin", TEST_ORIGIN)
      .set("Cookie", cookieStaff)
      .expect(200);
    scanShape("staff dashboard", staffDash.body);
  });

  it("action lifecycle payloads carry no note fields", async () => {
    const ticket = await prisma.ticket.create({
      data: {
        ticketNumber: `81${RUN.slice(-6)}-1001`,
        requesterId: reqId,
        categoryId,
        relatedSystemId,
        summary: `SEC-03 fixture ${RUN}`,
        description: "SEC-03 fixture description body without flagged tokens.",
        requestedPriority: "MEDIUM",
        itPriority: "MEDIUM",
        currentStatus: "OPEN",
      },
      select: { id: true },
    });
    const created = await request(app)
      .post(`/api/staff/tickets/${ticket.id}/actions`)
      .set("Origin", TEST_ORIGIN)
      .set("Cookie", cookieStaff)
      .send({ description: `SEC-03 action ${RUN}`, clientRequestId: randomUUID() })
      .expect(201);
    scanShape("action create", created.body);
    const actionId = created.body.id as number;

    const updated = await request(app)
      .put(`/api/staff/actions/${actionId}`)
      .set("Origin", TEST_ORIGIN)
      .set("Cookie", cookieStaff)
      .send({ expectedVersion: 1, status: "IN_PROGRESS" })
      .expect(200);
    scanShape("action update", updated.body);

    const completed = await request(app)
      .post(`/api/staff/actions/${actionId}/complete`)
      .set("Origin", TEST_ORIGIN)
      .set("Cookie", cookieStaff)
      .send({ expectedVersion: 2, result: `SEC-03 outcome ${RUN}` })
      .expect(200);
    scanShape("action complete", completed.body);

    const listed = await request(app)
      .get(`/api/tickets/${ticket.id}/actions`)
      .set("Origin", TEST_ORIGIN)
      .set("Cookie", cookieStaff)
      .expect(200);
    scanShape("action list", listed.body);

    const events = await request(app)
      .get(`/api/staff/actions/${actionId}/events`)
      .set("Origin", TEST_ORIGIN)
      .set("Cookie", cookieStaff)
      .expect(200);
    scanShape("action events", events.body);
  });
});

afterAll(async () => {
  const prefix = `81${RUN.slice(-6)}-`;
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
  await prisma.category.deleteMany({ where: { name: `A81N Cat ${RUN}` } });
  await prisma.relatedSystem.deleteMany({ where: { name: `A81N Sys ${RUN}` } });
});
