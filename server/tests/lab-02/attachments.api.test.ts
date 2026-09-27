import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import { hashPassword } from "../../src/lib/password-hash.js";
import { loginAs } from "../helpers/auth-test.js";
import fs from "fs";
import path from "path";

const UPLOAD_DIR = path.resolve("uploads");

function pngBuffer(size = 1024): Buffer {
  // Minimal PNG header + filler; isAllowedSignature now verifies magic bytes per mime
  const header = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (size <= header.length) return header.subarray(0, size);
  const buf = Buffer.alloc(size);
  header.copy(buf);
  return buf;
}

describe("Attachment lifecycle (Lab 2 Issue 10)", () => {
  const prisma = getPrisma();
  // Issue #46 (Lab 3): session-derived ownership — fixtures are real loginable
  // Users; every request carries the session cookie, no requesterId is sent.
  const emailA = "lab2-attach-a@example.com";
  const emailB = "lab2-attach-b@example.com";
  const password = "Lab2-Heal-Valid-9!";
  let requesterA: { id: number };
  let requesterB: { id: number };
  let cookieA: string;
  let cookieB: string;
  let category: { id: number };
  let relatedSystem: { id: number };
  let ticketA: { id: number; ticketNumber: string };
  let ticketB: { id: number; ticketNumber: string };

  const TICKET_A_NUM = "2608-1201";
  const TICKET_B_NUM = "2608-1202";

  beforeAll(async () => {
    await prisma.ticket.deleteMany({
      where: { ticketNumber: { in: [TICKET_A_NUM, TICKET_B_NUM] } },
    });

    const cat = await prisma.category.upsert({
      where: { name: "Hardware" },
      update: {},
      create: { name: "Hardware", isActive: true },
    });
    category = cat;

    const sys = await prisma.relatedSystem.upsert({
      where: { name: "Email" },
      update: {},
      create: { name: "Email", isActive: true },
    });
    relatedSystem = sys;

    const passwordHash = await hashPassword(password);
    await prisma.user.deleteMany({ where: { email: { in: [emailA, emailB] } } });
    const [userA, userB] = await Promise.all(
      [
        { name: "Requester A Attach", email: emailA },
        { name: "Requester B Attach", email: emailB },
      ].map((u) =>
        prisma.user.create({
          data: {
            name: u.name,
            email: u.email,
            passwordHash,
            role: "REQUESTER",
            isActive: true,
            mustChangePassword: false,
          },
          select: { id: true },
        })
      )
    );
    requesterA = { id: userA.id };
    requesterB = { id: userB.id };
    cookieA = await loginAs(emailA, password);
    cookieB = await loginAs(emailB, password);

    const tA = await prisma.ticket.create({
      data: {
        ticketNumber: TICKET_A_NUM,
        requesterId: requesterA.id,
        categoryId: category.id,
        relatedSystemId: relatedSystem.id,
        summary: "Attachment ticket A",
        description: "Description for attachment ticket A that is long enough to be valid",
        requestedPriority: "MEDIUM",
        itPriority: "MEDIUM",
        currentStatus: "NEW",
      },
    });
    ticketA = { id: tA.id, ticketNumber: tA.ticketNumber };

    const tB = await prisma.ticket.create({
      data: {
        ticketNumber: TICKET_B_NUM,
        requesterId: requesterB.id,
        categoryId: category.id,
        relatedSystemId: relatedSystem.id,
        summary: "Attachment ticket B",
        description: "Description for attachment ticket B that is long enough to be valid",
        requestedPriority: "LOW",
        itPriority: "LOW",
        currentStatus: "NEW",
      },
    });
    ticketB = { id: tB.id, ticketNumber: tB.ticketNumber };
  });

  afterAll(async () => {
    // Targeted cleanup: only this suite's ticketNumbers (never deleteMany without where)
    const transient = ["2608-1299", "2608-1298", "2608-1297", "2608-1296", "2608-1295"];
    await prisma.ticket.deleteMany({
      where: { ticketNumber: { in: [TICKET_A_NUM, TICKET_B_NUM, ...transient] } },
    });
    await prisma.user.deleteMany({
      where: { email: { in: [emailA, emailB] } },
    });
  });

  // -------------------------------------------------------------------------
  // POST /api/tickets/:id/attachments — upload
  // -------------------------------------------------------------------------
  describe("POST /api/tickets/:id/attachments — upload", () => {
    it("should return 201 for valid upload (AC-18)", async () => {
      const res = await request(app)
        .post(`/api/tickets/${ticketA.id}/attachments`)
        .set("Cookie", cookieA)
        .attach("file", pngBuffer(2048), { filename: "valid.png", contentType: "image/png" })
        .expect(201);

      expect(res.body.ticketId).toBe(ticketA.id);
      expect(res.body.originalFilename).toBe("valid.png");
      expect(res.body.mimeType).toBe("image/png");
      expect(res.body.sizeBytes).toBeGreaterThan(0);
      expect(res.body.removedAt).toBeNull();

      // Cleanup: remove DB record and uploaded file (try/finally pattern)
      try {
        const att = await prisma.attachment.findUnique({ where: { id: res.body.id } });
        expect(att).not.toBeNull();
        if (att) {
          const filePath = path.join(UPLOAD_DIR, att.storedFilename);
          // verify file exists on disk
          expect(fs.existsSync(filePath)).toBe(true);
        }
      } finally {
        // Cleanup DB and file regardless of assertion outcome
        const att = await prisma.attachment.findUnique({ where: { id: res.body.id } });
        if (att) {
          try {
            fs.unlinkSync(path.join(UPLOAD_DIR, att.storedFilename));
          } catch {}
          await prisma.attachment.delete({ where: { id: att.id } });
        }
      }
    });

    it("should return 415 for wrong file type (AC-19)", async () => {
      const before = await prisma.attachment.count({ where: { ticketId: ticketA.id } });
      const res = await request(app)
        .post(`/api/tickets/${ticketA.id}/attachments`)
        .set("Cookie", cookieA)
        .attach("file", Buffer.from("hello world"), { filename: "bad.txt", contentType: "text/plain" })
        .expect(415);
      expect(res.body.error.code).toBe("UNSUPPORTED_MEDIA_TYPE");
      const after = await prisma.attachment.count({ where: { ticketId: ticketA.id } });
      expect(after).toBe(before);
    });

    it("should return 413 for oversize file >5MB (AC-19)", async () => {
      const big = Buffer.alloc(5 * 1024 * 1024 + 1, 0x61);
      const res = await request(app)
        .post(`/api/tickets/${ticketA.id}/attachments`)
        .set("Cookie", cookieA)
        .attach("file", big, { filename: "big.png", contentType: "image/png" })
        .expect(413);
      expect(res.body.error.code).toBe("PAYLOAD_TOO_LARGE");
    });

    it("should return 409 when 5 active attachments exist (AC-20)", async () => {
      const ticketNumber = "2608-1299";
      let ticketId: number | undefined;
      try {
        // Ensure clean slate for this transient ticket
        await prisma.ticket.deleteMany({ where: { ticketNumber } });
        const t = await prisma.ticket.create({
          data: {
            ticketNumber,
            requesterId: requesterA.id,
            categoryId: category.id,
            relatedSystemId: relatedSystem.id,
            summary: "Limit ticket",
            description: "Description for limit ticket that is long enough to be valid",
            requestedPriority: "LOW",
            itPriority: "LOW",
            currentStatus: "NEW",
          },
        });
        ticketId = t.id;

        // Create 5 active attachments directly via Prisma (avoids file I/O for setup)
        for (let i = 0; i < 5; i++) {
          await prisma.attachment.create({
            data: {
              ticketId: t.id,
              originalFilename: `file${i}.png`,
              storedFilename: `limit-${Date.now()}-${i}-${Math.random().toString(36).slice(2)}.png`,
              mimeType: "image/png",
              sizeBytes: 1000,
            },
          });
        }

        const res = await request(app)
          .post(`/api/tickets/${t.id}/attachments`)
          .set("Cookie", cookieA)
          .attach("file", pngBuffer(1024), { filename: "extra.png", contentType: "image/png" })
          .expect(409);
        expect(res.body.error.code).toBe("CONFLICT");
      } finally {
        if (ticketId) {
          // Targeted cleanup by ticketNumber
          await prisma.ticket.deleteMany({ where: { ticketNumber } });
          // Also remove any orphan files for this ticket if they were written
          // (the 409 case unlinks the file in the route, so nothing to do)
        } else {
          await prisma.ticket.deleteMany({ where: { ticketNumber } });
        }
      }
    });

    it("should enforce mime+ext pairing (pdf ext with png mime → 415)", async () => {
      const res = await request(app)
        .post(`/api/tickets/${ticketA.id}/attachments`)
        .set("Cookie", cookieA)
        .attach("file", pngBuffer(1024), { filename: "mismatch.pdf", contentType: "image/png" })
        .expect(415);
      expect(res.body.error.code).toBe("UNSUPPORTED_MEDIA_TYPE");
    });

    it("should return 415 when signature mismatches mime (random bytes as png → 415)", async () => {
      const bad = Buffer.alloc(1024, 0x00);
      const res = await request(app)
        .post(`/api/tickets/${ticketA.id}/attachments`)
        .set("Cookie", cookieA)
        .attach("file", bad, { filename: "bad.png", contentType: "image/png" })
        .expect(415);
      expect(res.body.error.code).toBe("UNSUPPORTED_MEDIA_TYPE");
    });

    it("should handle concurrent uploads: 4 active → 2 parallel → 201+409 and final 5 (race guard)", async () => {
      const ticketNumber = "2608-1297";
      let ticketId: number | undefined;
      try {
        await prisma.ticket.deleteMany({ where: { ticketNumber } });
        const t = await prisma.ticket.create({
          data: {
            ticketNumber,
            requesterId: requesterA.id,
            categoryId: category.id,
            relatedSystemId: relatedSystem.id,
            summary: "Concurrent ticket",
            description: "Description for concurrent ticket that is long enough to be valid",
            requestedPriority: "LOW",
            itPriority: "LOW",
            currentStatus: "NEW",
          },
        });
        ticketId = t.id;
        for (let i = 0; i < 4; i++) {
          await prisma.attachment.create({
            data: {
              ticketId: t.id,
              originalFilename: `c${i}.png`,
              storedFilename: `conc-${Date.now()}-${i}-${Math.random().toString(36).slice(2)}.png`,
              mimeType: "image/png",
              sizeBytes: 1000,
            },
          });
        }
        const [r1, r2] = await Promise.all([
          request(app).post(`/api/tickets/${t.id}/attachments`).set("Cookie", cookieA).attach("file", pngBuffer(1024), { filename: "p1.png", contentType: "image/png" }),
          request(app).post(`/api/tickets/${t.id}/attachments`).set("Cookie", cookieA).attach("file", pngBuffer(1024), { filename: "p2.png", contentType: "image/png" }),
        ]);
        const codes = [r1.status, r2.status].sort();
        expect(codes).toEqual([201, 409]);
        const active = await prisma.attachment.count({ where: { ticketId: t.id, removedAt: null } });
        expect(active).toBe(5);
        // cleanup uploaded file from the 201
        const ok = r1.status === 201 ? r1.body : r2.body;
        const att = await prisma.attachment.findUnique({ where: { id: ok.id } });
        if (att) {
          try { fs.unlinkSync(path.join(UPLOAD_DIR, att.storedFilename)); } catch {}
          await prisma.attachment.delete({ where: { id: att.id } });
        }
      } finally {
        if (ticketId) await prisma.ticket.deleteMany({ where: { ticketNumber } });
        else await prisma.ticket.deleteMany({ where: { ticketNumber } });
      }
    });

    it("should return 400 when no file provided", async () => {
      const res = await request(app)
        .post(`/api/tickets/${ticketA.id}/attachments`)
        .set("Cookie", cookieA)
        .expect(400);
      expect(res.body.error.code).toBe("VALIDATION_FAILED");
      expect(res.body.fieldErrors.file).toBeDefined();
    });

    it("should return 404 when uploading to not-owned ticket (BR-09)", async () => {
      const res = await request(app)
        .post(`/api/tickets/${ticketB.id}/attachments`)
        .set("Cookie", cookieA)
        .attach("file", pngBuffer(1024), { filename: "cross.png", contentType: "image/png" })
        .expect(404);
      expect(res.body.error.code).toBe("NOT_FOUND");
    });

    it("should return 404 when ticket does not exist", async () => {
      const res = await request(app)
        .post(`/api/tickets/999999/attachments`)
        .set("Cookie", cookieA)
        .attach("file", pngBuffer(1024), { filename: "ghost.png", contentType: "image/png" })
        .expect(404);
      expect(res.body.error.code).toBe("NOT_FOUND");
    });
  });

  // -------------------------------------------------------------------------
  // GET /api/attachments/:id — metadata
  // -------------------------------------------------------------------------
  describe("GET /api/attachments/:id — metadata", () => {
    it("should return 200 for owned active attachment (API-26)", async () => {
      // Create owned attachment via upload to get real file on disk
      const upload = await request(app)
        .post(`/api/tickets/${ticketA.id}/attachments`)
        .set("Cookie", cookieA)
        .attach("file", pngBuffer(1024), { filename: "meta.png", contentType: "image/png" })
        .expect(201);
      try {
        const res = await request(app)
          .get(`/api/attachments/${upload.body.id}`)
          .set("Cookie", cookieA)
          .expect(200);
        expect(res.body.id).toBe(upload.body.id);
        expect(res.body.ticketId).toBe(ticketA.id);
        expect(res.body.originalFilename).toBe("meta.png");
        expect(res.body.mimeType).toBe("image/png");
        expect(res.body.removedAt).toBeNull();
      } finally {
        const att = await prisma.attachment.findUnique({ where: { id: upload.body.id } });
        if (att) {
          try { fs.unlinkSync(path.join(UPLOAD_DIR, att.storedFilename)); } catch {}
          await prisma.attachment.delete({ where: { id: att.id } });
        }
      }
    });

    it("should return 404 for cross-owner metadata (AC-24, API-24)", async () => {
      const upload = await request(app)
        .post(`/api/tickets/${ticketA.id}/attachments`)
        .set("Cookie", cookieA)
        .attach("file", pngBuffer(1024), { filename: "cross-meta.png", contentType: "image/png" })
        .expect(201);
      try {
        const res = await request(app)
          .get(`/api/attachments/${upload.body.id}`)
          .set("Cookie", cookieB)
          .expect(404);
        expect(res.body.error.code).toBe("NOT_FOUND");
      } finally {
        const att = await prisma.attachment.findUnique({ where: { id: upload.body.id } });
        if (att) {
          try { fs.unlinkSync(path.join(UPLOAD_DIR, att.storedFilename)); } catch {}
          await prisma.attachment.delete({ where: { id: att.id } });
        }
      }
    });

    it("should return 404 for missing attachment", async () => {
      const res = await request(app)
        .get(`/api/attachments/999999`)
        .set("Cookie", cookieA)
        .expect(404);
      expect(res.body.error.code).toBe("NOT_FOUND");
    });
  });

  // -------------------------------------------------------------------------
  // GET /api/attachments/:id/download — binary
  // -------------------------------------------------------------------------
  describe("GET /api/attachments/:id/download — binary", () => {
    it("should return 200 binary stream for owned active attachment (API-27)", async () => {
      const payload = pngBuffer(2048);
      const upload = await request(app)
        .post(`/api/tickets/${ticketA.id}/attachments`)
        .set("Cookie", cookieA)
        .attach("file", payload, { filename: "download.png", contentType: "image/png" })
        .expect(201);
      try {
        const res = await request(app)
          .get(`/api/attachments/${upload.body.id}/download`)
          .set("Cookie", cookieA)
          .expect(200);
        expect(res.headers["content-type"]).toBe("image/png");
        expect(res.headers["content-disposition"]).toContain('filename="download.png"');
        // Binary body should be non-empty
        expect(res.body.length).toBeGreaterThan(0);
      } finally {
        const att = await prisma.attachment.findUnique({ where: { id: upload.body.id } });
        if (att) {
          try { fs.unlinkSync(path.join(UPLOAD_DIR, att.storedFilename)); } catch {}
          await prisma.attachment.delete({ where: { id: att.id } });
        }
      }
    });

    it("should return 404 when downloading removed attachment (BR-17, API-20)", async () => {
      const upload = await request(app)
        .post(`/api/tickets/${ticketA.id}/attachments`)
        .set("Cookie", cookieA)
        .attach("file", pngBuffer(1024), { filename: "to-remove.png", contentType: "image/png" })
        .expect(201);
      try {
        // Soft-remove it
        await request(app)
          .post(`/api/attachments/${upload.body.id}/remove`)
          .set("Cookie", cookieA)
          .send({ reason: "Uploaded wrong file" })
          .expect(200);
        const res = await request(app)
          .get(`/api/attachments/${upload.body.id}/download`)
          .set("Cookie", cookieA)
          .expect(404);
        expect(res.body.error.code).toBe("NOT_FOUND");
      } finally {
        const att = await prisma.attachment.findUnique({ where: { id: upload.body.id } });
        if (att) {
          try { fs.unlinkSync(path.join(UPLOAD_DIR, att.storedFilename)); } catch {}
          await prisma.attachment.delete({ where: { id: att.id } });
        }
      }
    });

    it("should return 404 for cross-owner download (API-25)", async () => {
      const upload = await request(app)
        .post(`/api/tickets/${ticketA.id}/attachments`)
        .set("Cookie", cookieA)
        .attach("file", pngBuffer(1024), { filename: "cross-download.png", contentType: "image/png" })
        .expect(201);
      try {
        const res = await request(app)
          .get(`/api/attachments/${upload.body.id}/download`)
          .set("Cookie", cookieB)
          .expect(404);
        expect(res.body.error.code).toBe("NOT_FOUND");
      } finally {
        const att = await prisma.attachment.findUnique({ where: { id: upload.body.id } });
        if (att) {
          try { fs.unlinkSync(path.join(UPLOAD_DIR, att.storedFilename)); } catch {}
          await prisma.attachment.delete({ where: { id: att.id } });
        }
      }
    });
  });

  // -------------------------------------------------------------------------
  // POST /api/attachments/:id/remove — soft-remove
  // -------------------------------------------------------------------------
  describe("POST /api/attachments/:id/remove — soft-remove", () => {
    it("should return 200 when removing owned attachment with reason (API-19)", async () => {
      const upload = await request(app)
        .post(`/api/tickets/${ticketA.id}/attachments`)
        .set("Cookie", cookieA)
        .attach("file", pngBuffer(1024), { filename: "remove-me.png", contentType: "image/png" })
        .expect(201);
      try {
        const res = await request(app)
          .post(`/api/attachments/${upload.body.id}/remove`)
          .set("Cookie", cookieA)
          .send({ reason: "Uploaded wrong screenshot" })
          .expect(200);
        expect(res.body.id).toBe(upload.body.id);
        expect(res.body.removedReason).toBe("Uploaded wrong screenshot");
        expect(res.body.removedAt).toBeDefined();

        // Verify detail still lists removed attachment with metadata (FR-08)
        const detail = await request(app)
          .get(`/api/tickets/${ticketA.id}`)
          .set("Cookie", cookieA)
          .expect(200);
        const found = detail.body.attachments.find((a: any) => a.id === upload.body.id);
        expect(found).toBeDefined();
        expect(found.removedAt).not.toBeNull();
      } finally {
        const att = await prisma.attachment.findUnique({ where: { id: upload.body.id } });
        if (att) {
          try { fs.unlinkSync(path.join(UPLOAD_DIR, att.storedFilename)); } catch {}
          await prisma.attachment.delete({ where: { id: att.id } });
        }
      }
    });

    it("should return 400 for blank reason (AC-22, API-21)", async () => {
      const upload = await request(app)
        .post(`/api/tickets/${ticketA.id}/attachments`)
        .set("Cookie", cookieA)
        .attach("file", pngBuffer(1024), { filename: "blank-reason.png", contentType: "image/png" })
        .expect(201);
      try {
        const res = await request(app)
          .post(`/api/attachments/${upload.body.id}/remove`)
          .set("Cookie", cookieA)
          .send({ reason: "   " })
          .expect(400);
        expect(res.body.error.code).toBe("VALIDATION_FAILED");
        expect(res.body.fieldErrors.reason).toBeDefined();
      } finally {
        const att = await prisma.attachment.findUnique({ where: { id: upload.body.id } });
        if (att) {
          try { fs.unlinkSync(path.join(UPLOAD_DIR, att.storedFilename)); } catch {}
          await prisma.attachment.delete({ where: { id: att.id } });
        }
      }
    });

    it("should return 400 when reason missing entirely", async () => {
      const upload = await request(app)
        .post(`/api/tickets/${ticketA.id}/attachments`)
        .set("Cookie", cookieA)
        .attach("file", pngBuffer(1024), { filename: "no-reason.png", contentType: "image/png" })
        .expect(201);
      try {
        const res = await request(app)
          .post(`/api/attachments/${upload.body.id}/remove`)
          .set("Cookie", cookieA)
          .send({})
          .expect(400);
        expect(res.body.fieldErrors.reason).toBeDefined();
      } finally {
        const att = await prisma.attachment.findUnique({ where: { id: upload.body.id } });
        if (att) {
          try { fs.unlinkSync(path.join(UPLOAD_DIR, att.storedFilename)); } catch {}
          await prisma.attachment.delete({ where: { id: att.id } });
        }
      }
    });

    it("should return 409 when already removed (conflict)", async () => {
      const upload = await request(app)
        .post(`/api/tickets/${ticketA.id}/attachments`)
        .set("Cookie", cookieA)
        .attach("file", pngBuffer(1024), { filename: "double-remove.png", contentType: "image/png" })
        .expect(201);
      try {
        await request(app)
          .post(`/api/attachments/${upload.body.id}/remove`)
          .set("Cookie", cookieA)
          .send({ reason: "First removal" })
          .expect(200);
        const res = await request(app)
          .post(`/api/attachments/${upload.body.id}/remove`)
          .set("Cookie", cookieA)
          .send({ reason: "Second removal" })
          .expect(409);
        expect(res.body.error.code).toBe("CONFLICT");
      } finally {
        const att = await prisma.attachment.findUnique({ where: { id: upload.body.id } });
        if (att) {
          try { fs.unlinkSync(path.join(UPLOAD_DIR, att.storedFilename)); } catch {}
          await prisma.attachment.delete({ where: { id: att.id } });
        }
      }
    });

    it("should return 404 when cross-owner tries to remove (BR-09)", async () => {
      const upload = await request(app)
        .post(`/api/tickets/${ticketA.id}/attachments`)
        .set("Cookie", cookieA)
        .attach("file", pngBuffer(1024), { filename: "cross-remove.png", contentType: "image/png" })
        .expect(201);
      try {
        const res = await request(app)
          .post(`/api/attachments/${upload.body.id}/remove`)
          .set("Cookie", cookieB)
          .send({ reason: "Malicious removal" })
          .expect(404);
        expect(res.body.error.code).toBe("NOT_FOUND");
      } finally {
        const att = await prisma.attachment.findUnique({ where: { id: upload.body.id } });
        if (att) {
          try { fs.unlinkSync(path.join(UPLOAD_DIR, att.storedFilename)); } catch {}
          await prisma.attachment.delete({ where: { id: att.id } });
        }
      }
    });

    it("should return 404 for missing attachment on remove", async () => {
      const res = await request(app)
        .post(`/api/attachments/999999/remove`)
        .set("Cookie", cookieA)
        .send({ reason: "Does not exist" })
        .expect(404);
      expect(res.body.error.code).toBe("NOT_FOUND");
    });
  });
});
