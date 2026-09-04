import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import fs from "fs";
import path from "path";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";

const UPLOAD_DIR = path.resolve("uploads");

function pngBuffer(size = 1024): Buffer {
  const header = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const buffer = Buffer.alloc(Math.max(size, header.length));
  header.copy(buffer);
  return buffer;
}

describe("Initial attachment partial failure evidence (API-22 / AC-23)", () => {
  const prisma = getPrisma();
  const requesterEmail = "api22-partial-upload@test.local";
  let requester: { id: number };
  let category: { id: number };
  let relatedSystem: { id: number };

  beforeAll(async () => {
    const req = await prisma.developmentRequester.upsert({
      where: { email: requesterEmail },
      update: { name: "API 22 Partial Upload Requester", isActive: true },
      create: { name: "API 22 Partial Upload Requester", email: requesterEmail, isActive: true },
    });
    requester = { id: req.id };

    const cat = await prisma.category.findFirst({ where: { isActive: true }, orderBy: { name: "asc" } });
    const system = await prisma.relatedSystem.findFirst({ where: { isActive: true }, orderBy: { name: "asc" } });
    if (!cat || !system) throw new Error("API-22 requires seeded active Category and RelatedSystem data");
    category = { id: cat.id };
    relatedSystem = { id: system.id };
  });

  afterAll(async () => {
    if (requester) {
      await prisma.ticket.deleteMany({ where: { requesterId: requester.id } });
    }
    await prisma.developmentRequester.deleteMany({ where: { email: requesterEmail } });
  });

  it("keeps the Ticket and successful upload saved when a later initial-style upload fails", async () => {
    let ticketId: number | undefined;
    let successfulAttachmentId: number | undefined;

    try {
      const created = await request(app)
        .post("/api/tickets")
        .send({
          requesterId: requester.id,
          categoryId: category.id,
          relatedSystemId: relatedSystem.id,
          summary: "Partial attachment upload evidence",
          description: "This Ticket proves successful data survives a later attachment failure.",
          requestedPriority: "MEDIUM",
        })
        .expect(201);

      ticketId = created.body.id;

      const successfulUpload = await request(app)
        .post(`/api/tickets/${ticketId}/attachments?requesterId=${requester.id}`)
        .attach("file", pngBuffer(2048), { filename: "saved-evidence.png", contentType: "image/png" })
        .expect(201);
      successfulAttachmentId = successfulUpload.body.id;

      const failedUpload = await request(app)
        .post(`/api/tickets/${ticketId}/attachments?requesterId=${requester.id}`)
        .attach("file", Buffer.from("not permitted"), { filename: "rejected.txt", contentType: "text/plain" })
        .expect(415);
      expect(failedUpload.body.error.code).toBe("UNSUPPORTED_MEDIA_TYPE");

      const detail = await request(app)
        .get(`/api/tickets/${ticketId}?requesterId=${requester.id}`)
        .expect(200);

      expect(detail.body.id).toBe(ticketId);
      expect(detail.body.ticketNumber).toBe(created.body.ticketNumber);
      expect(detail.body.attachments).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: successfulAttachmentId,
            originalFilename: "saved-evidence.png",
            removedAt: null,
          }),
        ]),
      );
      expect(detail.body.attachments).not.toEqual(
        expect.arrayContaining([expect.objectContaining({ originalFilename: "rejected.txt" })]),
      );
    } finally {
      if (successfulAttachmentId) {
        const attachment = await prisma.attachment.findUnique({ where: { id: successfulAttachmentId } });
        if (attachment) {
          try {
            fs.unlinkSync(path.join(UPLOAD_DIR, attachment.storedFilename));
          } catch {}
        }
      }
      if (ticketId) {
        await prisma.ticket.deleteMany({ where: { id: ticketId } });
      }
    }
  });
});
