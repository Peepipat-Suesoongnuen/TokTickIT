import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import { SESSION_COOKIE_NAME } from "../../src/auth.js";
import { hashPassword } from "../../src/lib/password-hash.js";

// Issue #46 (Lab 3) — server cutover to session-derived ownership (FR-05,
// BR-03/19/20, api-spec §1.7): ticket + attachment routes derive the owner
// from the session, reject client-supplied requesterId, and scope reads to
// the authenticated user (cross-user direct access → safe 404).
const ORIGIN = "http://localhost:5174";
const PASSWORD = "Cutover-Valid-9!";

const RUN = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6)}`;
const EMAIL_A = `cutover-a-${RUN}@test.local`;
const EMAIL_B = `cutover-b-${RUN}@test.local`;

const prisma = getPrisma();

let userA: { id: number };
let userB: { id: number };
let categoryId: number;
let relatedSystemId: number;
let ticketAId: number;

function pngBuffer(size: number): Buffer {
  const header = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const filler = Buffer.alloc(Math.max(0, size - header.length), 1);
  return Buffer.concat([header, filler]);
}

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

function validTicketBody() {
  return {
    categoryId,
    relatedSystemId,
    summary: "Cutover probe",
    description: "Description long enough here.",
    requestedPriority: "MEDIUM",
  };
}

describe("session-derived ownership cutover (Issue #46)", () => {
  let cookieA: string;
  let cookieB: string;

  beforeAll(async () => {
    const passwordHash = await hashPassword(PASSWORD);
    const [a, b] = await Promise.all(
      [EMAIL_A, EMAIL_B].map((email, i) =>
        prisma.user.create({
          data: {
            name: `Cutover Fixture ${i === 0 ? "A" : "B"}`,
            email,
            passwordHash,
            role: "REQUESTER",
            isActive: true,
            mustChangePassword: false,
          },
          select: { id: true },
        })
      )
    );
    userA = a;
    userB = b;

    const category = await prisma.category.findFirst({
      where: { isActive: true },
      orderBy: { name: "asc" },
    });
    const system = await prisma.relatedSystem.findFirst({
      where: { isActive: true },
      orderBy: { name: "asc" },
    });
    if (!category || !system) throw new Error("Cutover test requires seeded active Category/RelatedSystem");
    categoryId = category.id;
    relatedSystemId = system.id;

    const ticket = await prisma.ticket.create({
      data: {
        ticketNumber: `46${String(Date.now() % 100).padStart(2, "0")}-${String(Math.floor(Math.random() * 9000) + 1000)}`,
        requesterId: userA.id,
        categoryId,
        relatedSystemId,
        summary: "Cutover fixture ticket",
        description: "Fixture ticket owned by user A for cutover tests.",
        requestedPriority: "MEDIUM",
        itPriority: "MEDIUM",
        currentStatus: "NEW",
      },
      select: { id: true },
    });
    ticketAId = ticket.id;

    cookieA = await loginAs(EMAIL_A);
    cookieB = await loginAs(EMAIL_B);
  });

  afterAll(async () => {
    await prisma.ticket.deleteMany({ where: { requesterId: { in: [userA?.id, userB?.id].filter(Boolean) as number[] } } });
    await prisma.user.deleteMany({ where: { email: { in: [EMAIL_A, EMAIL_B] } } });
  });

  it("API-11: created Ticket persists AUTH user as requester (no requesterId sent)", async () => {
    const create = await request(app)
      .post("/api/tickets")
      .set("Cookie", cookieA)
      .set("Origin", ORIGIN)
      .send(validTicketBody())
      .expect(201);
    expect(create.body.requester.id).toBe(userA.id);
    const persisted = await prisma.ticket.findUniqueOrThrow({ where: { id: create.body.id } });
    expect(persisted.requesterId).toBe(userA.id);
  });

  it("API-12: requesterId in body rejected, never overrides", async () => {
    const spoof = await request(app)
      .post("/api/tickets")
      .set("Cookie", cookieA)
      .set("Origin", ORIGIN)
      .send({ ...validTicketBody(), requesterId: userB.id })
      .expect(400);
    expect(spoof.body.error.code).toBe("VALIDATION_FAILED");
    expect(spoof.body.fieldErrors?.requesterId).toBe("Unknown parameter.");
    // Nothing persisted for the spoofed owner.
    const leaked = await prisma.ticket.findFirst({
      where: { requesterId: userB.id, summary: "Cutover probe" },
    });
    expect(leaked).toBeNull();
  });

  it("API-12: requesterId in query rejected on list/detail/attachment reads", async () => {
    for (const path of [`/api/tickets?requesterId=${userA.id}`, `/api/tickets/${ticketAId}?requesterId=${userA.id}`, `/api/attachments/1?requesterId=${userA.id}`, `/api/attachments/1/download?requesterId=${userA.id}`]) {
      const res = await request(app).get(path).set("Cookie", cookieA).expect(400);
      expect(res.body.error.code).toBe("VALIDATION_FAILED");
      expect(res.body.fieldErrors?.requesterId).toBe("Unknown parameter.");
    }
    const uploadSpoof = await request(app)
      .post(`/api/tickets/${ticketAId}/attachments?requesterId=${userB.id}`)
      .set("Cookie", cookieA)
      .set("Origin", ORIGIN)
      .attach("file", pngBuffer(1024), { filename: "q.png", contentType: "image/png" })
      .expect(400);
    expect(uploadSpoof.body.error.code).toBe("VALIDATION_FAILED");
    expect(uploadSpoof.body.fieldErrors?.requesterId).toBe("Unknown parameter.");
    const removeSpoof = await request(app)
      .post(`/api/attachments/1/remove?requesterId=${userB.id}`)
      .set("Cookie", cookieA)
      .set("Origin", ORIGIN)
      .send({ reason: "spoof" })
      .expect(400);
    expect(removeSpoof.body.error.code).toBe("VALIDATION_FAILED");
    expect(removeSpoof.body.fieldErrors?.requesterId).toBe("Unknown parameter.");
  });

  it("API-13/SEC-02: B cannot list or open A's tickets (safe 404, no leak)", async () => {
    const list = await request(app).get("/api/tickets").set("Cookie", cookieB).expect(200);
    const ids = (list.body.data as Array<{ id: number }>).map((t) => t.id);
    expect(ids).not.toContain(ticketAId);

    const detail = await request(app).get(`/api/tickets/${ticketAId}`).set("Cookie", cookieB).expect(404);
    expect(detail.body.error.code).toBe("NOT_FOUND");

    const missing = await request(app).get("/api/tickets/999999999").set("Cookie", cookieB).expect(404);
    expect(missing.body).toEqual(detail.body);
  });

  it("unauthenticated requests to all 7 routes are 401 UNAUTHENTICATED", async () => {
    const gets = ["/api/tickets", `/api/tickets/${ticketAId}`, "/api/attachments/1", "/api/attachments/1/download"];
    for (const path of gets) {
      const res = await request(app).get(path).expect(401);
      expect(res.body.error.code).toBe("UNAUTHENTICATED");
    }
    const postTicket = await request(app)
      .post("/api/tickets")
      .set("Origin", ORIGIN)
      .send(validTicketBody())
      .expect(401);
    expect(postTicket.body.error.code).toBe("UNAUTHENTICATED");

    const upload = await request(app)
      .post(`/api/tickets/${ticketAId}/attachments`)
      .set("Origin", ORIGIN)
      .attach("file", pngBuffer(1024), { filename: "anon.png", contentType: "image/png" })
      .expect(401);
    expect(upload.body.error.code).toBe("UNAUTHENTICATED");

    const remove = await request(app)
      .post("/api/attachments/1/remove")
      .set("Origin", ORIGIN)
      .send({ reason: "anon" })
      .expect(401);
    expect(remove.body.error.code).toBe("UNAUTHENTICATED");
  });

  it("attachment spoof/ownership: B gets safe 404 on A's metadata/download/upload/remove", async () => {
    // A uploads to own ticket.
    const upload = await request(app)
      .post(`/api/tickets/${ticketAId}/attachments`)
      .set("Cookie", cookieA)
      .set("Origin", ORIGIN)
      .attach("file", pngBuffer(2048), { filename: "owned.png", contentType: "image/png" })
      .expect(201);
    const attachmentId = upload.body.id as number;

    // B uploads to A's ticket → same safe 404 as nonexistent (existing semantics: not found).
    const crossUpload = await request(app)
      .post(`/api/tickets/${ticketAId}/attachments`)
      .set("Cookie", cookieB)
      .set("Origin", ORIGIN)
      .attach("file", pngBuffer(1024), { filename: "cross.png", contentType: "image/png" })
      .expect(404);
    expect(crossUpload.body.error.code).toBe("NOT_FOUND");

    // B reads A's attachment metadata/download → 404.
    const meta = await request(app).get(`/api/attachments/${attachmentId}`).set("Cookie", cookieB).expect(404);
    expect(meta.body.error.code).toBe("NOT_FOUND");
    await request(app).get(`/api/attachments/${attachmentId}/download`).set("Cookie", cookieB).expect(404);

    // B removes A's attachment → 404; A removes own → 200 (preserved semantics).
    const crossRemove = await request(app)
      .post(`/api/attachments/${attachmentId}/remove`)
      .set("Cookie", cookieB)
      .set("Origin", ORIGIN)
      .send({ reason: "not mine" })
      .expect(404);
    expect(crossRemove.body.error.code).toBe("NOT_FOUND");

    // A still owns and can read it.
    const ownMeta = await request(app).get(`/api/attachments/${attachmentId}`).set("Cookie", cookieA).expect(200);
    expect(ownMeta.body.id).toBe(attachmentId);

    const ownRemove = await request(app)
      .post(`/api/attachments/${attachmentId}/remove`)
      .set("Cookie", cookieA)
      .set("Origin", ORIGIN)
      .send({ reason: "no longer needed" })
      .expect(200);
    expect(ownRemove.body.id).toBe(attachmentId);
  });
});
