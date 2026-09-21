import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import { SESSION_COOKIE_NAME } from "../../src/auth.js";
import { hashPassword } from "../../src/lib/password-hash.js";

// Issue #49 (Lab 3) — Internal Notes, staff-only (FR-14, AC-12, BR-04,
// BR-34–38, api-spec §12): append-only backend-authored notes with channel
// length rules, safe Requester rejection, and zero leakage into Requester
// responses (SEC-03). XSS-like content is stored/returned as plain text
// (SEC-08).
const ORIGIN = "http://localhost:5174";
const PASSWORD = "Notes-Valid-9!";

const RUN = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6)}`;
const EMAIL_STAFF = `q49-nstaff-${RUN}@test.local`;
const EMAIL_ADMIN = `q49-nadmin-${RUN}@test.local`;
const EMAIL_REQUESTER = `q49-nreq-${RUN}@test.local`;

const prisma = getPrisma();

let staffId = 0;
let requesterId = 0;
let categoryId = 0;
let relatedSystemId = 0;
let ticketId = 0;

let cookieStaff = "";
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

describe("Staff Internal Notes (Issue #49, AC-12)", () => {
  beforeAll(async () => {
    const passwordHash = await hashPassword(PASSWORD);
    const users = await Promise.all(
      [
        { email: EMAIL_STAFF, role: "IT_STAFF" },
        { email: EMAIL_ADMIN, role: "ADMINISTRATOR" },
        { email: EMAIL_REQUESTER, role: "REQUESTER" },
      ].map((u) =>
        prisma.user.create({
          data: {
            name: `NT49 ${u.role} ${RUN}`,
            email: u.email,
            passwordHash,
            role: u.role as "IT_STAFF" | "ADMINISTRATOR" | "REQUESTER",
            isActive: true,
            mustChangePassword: false,
          },
          select: { id: true },
        })
      )
    );
    [staffId, , requesterId] = [users[0].id, users[1].id, users[2].id];

    const category = await prisma.category.findFirst({ where: { isActive: true }, orderBy: { name: "asc" } });
    const system = await prisma.relatedSystem.findFirst({ where: { isActive: true }, orderBy: { name: "asc" } });
    if (!category || !system) throw new Error("Notes test requires seeded active Category/RelatedSystem");
    categoryId = category.id;
    relatedSystemId = system.id;

    const ticket = await prisma.ticket.create({
      data: {
        ticketNumber: `49${RUN.slice(-6)}-6001`,
        requesterId,
        categoryId,
        relatedSystemId,
        summary: `Notes fixture ${RUN}`,
        description: "Notes fixture description body.",
        requestedPriority: "MEDIUM",
        itPriority: "MEDIUM",
        currentStatus: "OPEN",
        ticketOwnerId: staffId,
      },
      select: { id: true },
    });
    ticketId = ticket.id;

    cookieStaff = await loginAs(EMAIL_STAFF);
    cookieAdmin = await loginAs(EMAIL_ADMIN);
    cookieRequester = await loginAs(EMAIL_REQUESTER);
  });

  afterAll(async () => {
    await prisma.internalNote.deleteMany({ where: { ticketId } });
    await prisma.ticket.deleteMany({ where: { id: ticketId } });
    await prisma.user.deleteMany({ where: { email: { in: [EMAIL_STAFF, EMAIL_ADMIN, EMAIL_REQUESTER] } } });
  });

  it("API-35: Staff/Admin notes are append-only, backend-authored, ordered, validated", async () => {
    const empty = await request(app).get(`/api/staff/tickets/${ticketId}/internal-notes`).set("Cookie", cookieStaff).expect(200);
    expect(empty.body).toEqual({ data: [] });

    const first = await request(app)
      .post(`/api/staff/tickets/${ticketId}/internal-notes`)
      .set("Cookie", cookieStaff)
      .set("Origin", ORIGIN)
      .send({ content: "  Cache profile was stale.  " })
      .expect(201);
    expect(first.body).toMatchObject({
      author: { id: staffId, name: expect.any(String), role: "IT_STAFF" },
      content: "Cache profile was stale.",
    });

    const second = await request(app)
      .post(`/api/staff/tickets/${ticketId}/internal-notes`)
      .set("Cookie", cookieAdmin)
      .set("Origin", ORIGIN)
      .send({ content: "Confirmed with the network team." })
      .expect(201);
    expect(second.body.author).toMatchObject({ role: "ADMINISTRATOR" });

    const list = await request(app).get(`/api/staff/tickets/${ticketId}/internal-notes`).set("Cookie", cookieStaff).expect(200);
    expect(list.body.data.map((n: { id: number }) => n.id)).toEqual([first.body.id, second.body.id]);

    for (const bad of ["", "   ", "x".repeat(2001)]) {
      const res = await request(app)
        .post(`/api/staff/tickets/${ticketId}/internal-notes`)
        .set("Cookie", cookieStaff)
        .set("Origin", ORIGIN)
        .send({ content: bad })
        .expect(400);
      expect(res.body.error.code).toBe("VALIDATION_FAILED");
    }

    const spoof = await request(app)
      .post(`/api/staff/tickets/${ticketId}/internal-notes`)
      .set("Cookie", cookieStaff)
      .set("Origin", ORIGIN)
      .send({ content: "Valid.", authorId: requesterId })
      .expect(400);
    expect(spoof.body.error.code).toBe("VALIDATION_FAILED");
  });

  it("API-34/SEC-03: Requester note access is forbidden with zero content exposure", async () => {
    const get = await request(app).get(`/api/staff/tickets/${ticketId}/internal-notes`).set("Cookie", cookieRequester).expect(403);
    expect(get.body.error.code).toBe("FORBIDDEN");
    expect(JSON.stringify(get.body)).not.toContain("Cache profile");

    const post = await request(app)
      .post(`/api/staff/tickets/${ticketId}/internal-notes`)
      .set("Cookie", cookieRequester)
      .set("Origin", ORIGIN)
      .send({ content: "Trying to write a note." })
      .expect(403);
    expect(post.body.error.code).toBe("FORBIDDEN");
  });

  it("API-36/SEC-03: Requester detail and comment responses never carry notes", async () => {
    const detail = await request(app).get(`/api/tickets/${ticketId}`).set("Cookie", cookieRequester).expect(200);
    expect("internalNotes" in detail.body).toBe(false);
    expect(JSON.stringify(detail.body)).not.toContain("Cache profile");

    const comments = await request(app).get(`/api/tickets/${ticketId}/comments`).set("Cookie", cookieRequester).expect(200);
    expect(JSON.stringify(comments.body)).not.toContain("Cache profile");
  });

  it("SEC-08: script-like content is stored and returned as plain text", async () => {
    const payload = "<script>alert(1)</script>";
    const created = await request(app)
      .post(`/api/staff/tickets/${ticketId}/internal-notes`)
      .set("Cookie", cookieStaff)
      .set("Origin", ORIGIN)
      .send({ content: payload })
      .expect(201);
    expect(created.body.content).toBe(payload);

    const list = await request(app).get(`/api/staff/tickets/${ticketId}/internal-notes`).set("Cookie", cookieStaff).expect(200);
    const found = (list.body.data as Array<{ content: string }>).find((n) => n.content === payload);
    expect(found).toBeDefined();
  });
});
