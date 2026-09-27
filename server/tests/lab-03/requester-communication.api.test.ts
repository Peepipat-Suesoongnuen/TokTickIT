import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import { SESSION_COOKIE_NAME } from "../../src/auth.js";
import { hashPassword } from "../../src/lib/password-hash.js";

// Issue #49 (Lab 3) — Requester Public Comments + Problem Appears Resolved
// (FR-07/08, AC-06/12, api-spec §7): append-only backend-authored comments,
// exact resolution-indication status matrix with idempotency, and safe
// cross-requester hiding.
const ORIGIN = "http://localhost:5174";
const PASSWORD = "Comm-Valid-9!";

const RUN = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6)}`;
const EMAIL_A = `q49-ca-${RUN}@test.local`;
const EMAIL_B = `q49-cb-${RUN}@test.local`;
const EMAIL_STAFF = `q49-cstaff-${RUN}@test.local`;

const prisma = getPrisma();

let userA = 0;
let userB = 0;
let staffId = 0;
let categoryId = 0;
let relatedSystemId = 0;
let ticketA = 0;
let ticketB = 0;

let cookieA = "";
let cookieB = "";
let cookieStaff = "";

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
async function makeTicket(requester: number, status: "NEW" | "OPEN" | "IN_PROGRESS" | "WAITING_FOR_REQUESTER" | "RESOLVED" | "CLOSED" | "CANCELLED" | "REOPENED" = "NEW"): Promise<number> {
  ticketSeq += 1;
  const row = await prisma.ticket.create({
    data: {
      ticketNumber: `49${RUN.slice(-6)}-${String(1000 + ticketSeq)}`,
      requesterId: requester,
      categoryId,
      relatedSystemId,
      summary: `Comm fixture ${RUN} #${ticketSeq}`,
      description: "Communication fixture description body.",
      requestedPriority: "MEDIUM",
      itPriority: "MEDIUM",
      currentStatus: status,
    },
    select: { id: true },
  });
  return row.id;
}

describe("Requester communication (Issue #49, AC-06/12)", () => {
  beforeAll(async () => {
    const passwordHash = await hashPassword(PASSWORD);
    const users = await Promise.all(
      [
        { email: EMAIL_A, role: "REQUESTER" },
        { email: EMAIL_B, role: "REQUESTER" },
        { email: EMAIL_STAFF, role: "IT_STAFF" },
      ].map((u) =>
        prisma.user.create({
          data: {
            name: `CM49 ${u.role} ${RUN}`,
            email: u.email,
            passwordHash,
            role: u.role as "REQUESTER" | "IT_STAFF",
            isActive: true,
            mustChangePassword: false,
          },
          select: { id: true },
        })
      )
    );
    [userA, userB, staffId] = users.map((u) => u.id);

    const category = await prisma.category.findFirst({ where: { isActive: true }, orderBy: { name: "asc" } });
    const system = await prisma.relatedSystem.findFirst({ where: { isActive: true }, orderBy: { name: "asc" } });
    if (!category || !system) throw new Error("Comm test requires seeded active Category/RelatedSystem");
    categoryId = category.id;
    relatedSystemId = system.id;

    ticketA = await makeTicket(userA, "OPEN");
    ticketB = await makeTicket(userB, "OPEN");

    cookieA = await loginAs(EMAIL_A);
    cookieB = await loginAs(EMAIL_B);
    cookieStaff = await loginAs(EMAIL_STAFF);
  });

  afterAll(async () => {
    await prisma.publicComment.deleteMany({ where: { ticketId: { in: [ticketA, ticketB] } } });
    await prisma.ticket.deleteMany({ where: { id: { in: [ticketA, ticketB] } } });
    await prisma.user.deleteMany({ where: { email: { in: [EMAIL_A, EMAIL_B, EMAIL_STAFF] } } });
  });

  it("API-16: owned detail exposes owner/priority/indication without email or notes", async () => {
    const owned = await request(app).get(`/api/tickets/${ticketA}`).set("Cookie", cookieA).expect(200);
    expect(owned.body.ticketOwner).toBeNull();
    expect(owned.body.itPriority).toBe("MEDIUM");
    expect(owned.body.requesterResolutionIndicatedAt).toBeNull();
    expect("internalNotes" in owned.body).toBe(false);

    const assignedId = await makeTicket(userA, "OPEN");
    await prisma.ticket.update({ where: { id: assignedId }, data: { ticketOwnerId: staffId } });
    try {
      const assigned = await request(app).get(`/api/tickets/${assignedId}`).set("Cookie", cookieA).expect(200);
      expect(assigned.body.ticketOwner).toMatchObject({ id: staffId, name: expect.any(String) });
      expect(Object.keys(assigned.body.ticketOwner).sort()).toEqual(["id", "name"]);
    } finally {
      await prisma.ticket.deleteMany({ where: { id: assignedId } });
    }
  });

  it("API-17: own comments are append-only, backend-authored, ordered, validated", async () => {
    const empty = await request(app).get(`/api/tickets/${ticketA}/comments`).set("Cookie", cookieA).expect(200);
    expect(empty.body).toEqual({ data: [] });

    const first = await request(app)
      .post(`/api/tickets/${ticketA}/comments`)
      .set("Cookie", cookieA)
      .set("Origin", ORIGIN)
      .send({ content: "  Still broken after restart.  " })
      .expect(201);
    expect(first.body).toMatchObject({
      author: { id: userA, name: expect.any(String), role: "REQUESTER" },
      content: "Still broken after restart.",
    });
    expect(typeof first.body.createdAt).toBe("string");

    const second = await request(app)
      .post(`/api/tickets/${ticketA}/comments`)
      .set("Cookie", cookieA)
      .set("Origin", ORIGIN)
      .send({ content: "Second update." })
      .expect(201);

    // Deterministic createdAt ASC, id ASC order.
    const list = await request(app).get(`/api/tickets/${ticketA}/comments`).set("Cookie", cookieA).expect(200);
    expect(list.body.data.map((c: { id: number }) => c.id)).toEqual([first.body.id, second.body.id]);
    // Backend authorship held for every row.
    expect(list.body.data.every((c: { author: { id: number } }) => c.author.id === userA)).toBe(true);

    // Spoofed author/time fields are rejected as unknown input.
    const spoof = await request(app)
      .post(`/api/tickets/${ticketA}/comments`)
      .set("Cookie", cookieA)
      .set("Origin", ORIGIN)
      .send({ content: "Valid.", authorId: userB, createdAt: "2020-01-01T00:00:00.000Z" })
      .expect(400);
    expect(spoof.body.error.code).toBe("VALIDATION_FAILED");

    // Empty / whitespace / over-limit rejected.
    for (const bad of ["", "   ", "x".repeat(201)]) {
      const res = await request(app)
        .post(`/api/tickets/${ticketA}/comments`)
        .set("Cookie", cookieA)
        .set("Origin", ORIGIN)
        .send({ content: bad })
        .expect(400);
      expect(res.body.error.code).toBe("VALIDATION_FAILED");
    }
  });

  it("API-17: cross-requester comment access is safely hidden; staff sees authorized tickets", async () => {
    const hidden = await request(app).get(`/api/tickets/${ticketB}/comments`).set("Cookie", cookieA).expect(404);
    expect(hidden.body.error.code).toBe("TICKET_NOT_FOUND");

    const hiddenPost = await request(app)
      .post(`/api/tickets/${ticketB}/comments`)
      .set("Cookie", cookieA)
      .set("Origin", ORIGIN)
      .send({ content: "Not mine." })
      .expect(404);
    expect(hiddenPost.body.error.code).toBe("TICKET_NOT_FOUND");

    const staff = await request(app).get(`/api/tickets/${ticketA}/comments`).set("Cookie", cookieStaff).expect(200);
    expect(Array.isArray(staff.body.data)).toBe(true);

    const staffPost = await request(app)
      .post(`/api/tickets/${ticketA}/comments`)
      .set("Cookie", cookieStaff)
      .set("Origin", ORIGIN)
      .send({ content: "Staff follow-up." })
      .expect(201);
    expect(staffPost.body.author).toMatchObject({ id: staffId, role: "IT_STAFF" });
  });

  it("API-18: resolution indication follows the exact status matrix and is idempotent", async () => {
    // Allowed states set the indication without touching formal status.
    for (const status of ["NEW", "OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER", "REOPENED"] as const) {
      const id = await makeTicket(userA, status);
      try {
        const res = await request(app)
          .post(`/api/tickets/${id}/problem-appears-resolved`)
          .set("Cookie", cookieA)
          .set("Origin", ORIGIN)
          .send({})
          .expect(200);
        expect(typeof res.body.requesterResolutionIndicatedAt).toBe("string");
        const stored = await prisma.ticket.findUnique({
          where: { id },
          select: { requesterResolutionIndicatedAt: true, currentStatus: true },
        });
        expect(stored?.currentStatus).toBe(status);

        // Idempotent repeat keeps the same timestamp.
        const again = await request(app)
          .post(`/api/tickets/${id}/problem-appears-resolved`)
          .set("Cookie", cookieA)
          .set("Origin", ORIGIN)
          .send({})
          .expect(200);
        expect(again.body.requesterResolutionIndicatedAt).toBe(res.body.requesterResolutionIndicatedAt);
      } finally {
        await prisma.ticket.deleteMany({ where: { id } });
      }
    }

    // Rejected states leave everything unchanged.
    for (const status of ["RESOLVED", "CLOSED", "CANCELLED"] as const) {
      const id = await makeTicket(userA, status);
      try {
        const res = await request(app)
          .post(`/api/tickets/${id}/problem-appears-resolved`)
          .set("Cookie", cookieA)
          .set("Origin", ORIGIN)
          .send({})
          .expect(409);
        expect(res.body.error.code).toBe("INVALID_TICKET_STATE");
        const stored = await prisma.ticket.findUnique({
          where: { id },
          select: { requesterResolutionIndicatedAt: true, currentStatus: true },
        });
        expect(stored).toMatchObject({ requesterResolutionIndicatedAt: null, currentStatus: status });
      } finally {
        await prisma.ticket.deleteMany({ where: { id } });
      }
    }
  });

  it("API-18: indication is requester-only on own tickets", async () => {
    const other = await request(app)
      .post(`/api/tickets/${ticketB}/problem-appears-resolved`)
      .set("Cookie", cookieA)
      .set("Origin", ORIGIN)
      .send({})
      .expect(404);
    expect(other.body.error.code).toBe("TICKET_NOT_FOUND");

    const staff = await request(app)
      .post(`/api/tickets/${ticketA}/problem-appears-resolved`)
      .set("Cookie", cookieStaff)
      .set("Origin", ORIGIN)
      .send({})
      .expect(403);
    expect(staff.body.error.code).toBe("FORBIDDEN");
  });

  it("API-37: a Requester comment while WAITING never moves status", async () => {
    const id = await makeTicket(userA, "WAITING_FOR_REQUESTER");
    try {
      await request(app)
        .post(`/api/tickets/${id}/comments`)
        .set("Cookie", cookieA)
        .set("Origin", ORIGIN)
        .send({ content: "Here is the log you asked for." })
        .expect(201);
      const stored = await prisma.ticket.findUnique({ where: { id }, select: { currentStatus: true } });
      expect(stored?.currentStatus).toBe("WAITING_FOR_REQUESTER");
    } finally {
      await prisma.publicComment.deleteMany({ where: { ticketId: id } });
      await prisma.ticket.deleteMany({ where: { id } });
    }
  });
});
