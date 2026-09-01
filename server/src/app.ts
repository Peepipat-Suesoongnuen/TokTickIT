import express, { Request, Response } from "express";
import cors from "cors";
import { getPrisma } from "./prisma.js";
import { sendError } from "./lib/errors.js";
import {
  trimValue,
  isSummaryValid,
  isDescriptionValid,
  isPriorityValid,
} from "./lib/validation.js";
import { formatYYMM, formatTicketNumber, getNextSequence } from "./lib/ticket-number.js";
import multer from "multer";
import { v4 as uuid } from "uuid";
import path from "path";
import fs from "fs";
import { isAllowedMime, isAllowedSignature, MAX_ACTIVE } from "./lib/attachmentValidation.js";
// getPrisma() is your lazy database handle. Call it INSIDE a route when you
// need the DB (Issue 4).

const UPLOAD_DIR = path.resolve("uploads");
try { fs.mkdirSync(UPLOAD_DIR, { recursive: true }); } catch { /* ignore */ }

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!isAllowedMime(file.mimetype, ext)) {
      const err = new Error("415") as Error & { code?: string };
      (err as unknown as { status?: number }).status = 415;
      return cb(err);
    }
    cb(null, true);
  },
});

// The Express app is exported separately from app.listen() (see index.ts) so
// Supertest can import `app` without opening a port. Do not merge these files.
export const app = express();

app.use(cors());          // already wired: lets the Vite dev server call this API
app.use(express.json());

// ---------------------------------------------------------------------------
// Issue 2 — API health check
// Make the test in tests/lab-01/health.test.ts pass.
// It must return HTTP 200 with JSON: { status: "ok", service: "TokTickIT API" }
// ---------------------------------------------------------------------------
app.get("/api/health", (_req: Request, res: Response) => {
  res.status(200).json({ status: "ok", service: "TokTickIT API" });
});

// ---------------------------------------------------------------------------
// Issue 4 — Category list (evolved in Lab 2)
// GET /api/categories?requesterId= — when requesterId is supplied, validates
// active requester (400 if invalid). Always returns active-only ordered by name ASC.
// Keeps backward compat for Lab 1 tests (no requesterId → still 200).
// ---------------------------------------------------------------------------
app.get("/api/categories", async (req: Request, res: Response) => {
  try {
    const requesterIdRaw = req.query.requesterId as string | undefined;
    if (requesterIdRaw !== undefined) {
      const rid = Number(requesterIdRaw);
      if (!Number.isInteger(rid) || rid <= 0) {
        return sendError(res, 400, "VALIDATION_FAILED", "One or more fields are invalid.", {
          requesterId: "requesterId must be a positive integer.",
        });
      }
      const reqExists = await getPrisma().developmentRequester.findFirst({
        where: { id: rid, isActive: true },
      });
      if (!reqExists) {
        return sendError(res, 400, "VALIDATION_FAILED", "One or more fields are invalid.", {
          requesterId: "requesterId must reference an active requester.",
        });
      }
    }
    const categories = await getPrisma().category.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
    res.status(200).json(categories);
  } catch (err) {
    sendError(res, 500, "INTERNAL_ERROR", "An unexpected error occurred. Please try again.");
  }
});

app.get("/api/related-systems", async (req: Request, res: Response) => {
  try {
    const requesterIdRaw = req.query.requesterId as string | undefined;
    if (requesterIdRaw !== undefined) {
      const rid = Number(requesterIdRaw);
      if (!Number.isInteger(rid) || rid <= 0) {
        return sendError(res, 400, "VALIDATION_FAILED", "One or more fields are invalid.", {
          requesterId: "requesterId must be a positive integer.",
        });
      }
      const reqExists = await getPrisma().developmentRequester.findFirst({
        where: { id: rid, isActive: true },
      });
      if (!reqExists) {
        return sendError(res, 400, "VALIDATION_FAILED", "One or more fields are invalid.", {
          requesterId: "requesterId must reference an active requester.",
        });
      }
    }
    const systems = await getPrisma().relatedSystem.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
    res.status(200).json(systems);
  } catch (err) {
    sendError(res, 500, "INTERNAL_ERROR", "An unexpected error occurred. Please try again.");
  }
});

// ---------------------------------------------------------------------------
// Lab 2 Issue 7 — Development Requester context
// GET /api/requesters — returns only active requesters, ordered by name ASC
// No requesterId required (powers selection itself). Empty array when none.
// ---------------------------------------------------------------------------
app.get("/api/requesters", async (_req: Request, res: Response) => {
  try {
    const requesters = await getPrisma().developmentRequester.findMany({
      where: { isActive: true },
      select: { id: true, name: true, email: true },
      orderBy: { name: "asc" },
    });
    res.status(200).json(requesters);
  } catch (err) {
    sendError(res, 500, "INTERNAL_ERROR", "An unexpected error occurred. Please try again.");
  }
});

// ---------------------------------------------------------------------------
// Lab 2 Issue 9 — My Tickets (owned list)
// GET /api/tickets?requesterId=&search=&categoryId=&requestedPriority=&sort=&order=&page=&pageSize=
// ---------------------------------------------------------------------------
app.get("/api/tickets", async (req: Request, res: Response) => {
  try {
    const allowed = new Set(["requesterId", "search", "categoryId", "requestedPriority", "sort", "order", "page", "pageSize"]);
    for (const k of Object.keys(req.query)) {
      if (!allowed.has(k)) {
        return sendError(res, 400, "VALIDATION_FAILED", "One or more fields are invalid.", { [k]: "Unknown parameter." });
      }
    }

    // Guard: duplicate/malformed query values arrive as string[] -> 400 (BR-20 strict contract)
    const rawParams = ["requesterId", "search", "categoryId", "requestedPriority", "sort", "order", "page", "pageSize"] as const;
    for (const p of rawParams) {
      const v = (req.query as Record<string, unknown>)[p];
      if (v !== undefined && typeof v !== "string") {
        return sendError(res, 400, "VALIDATION_FAILED", "One or more fields are invalid.", { [p]: `${p} must be a single value.` });
      }
    }

    const { requesterId, search, categoryId, requestedPriority, sort, order, page, pageSize } = req.query as Record<string, string | undefined>;

    const fieldErrors: Record<string, string> = {};

    // requesterId required
    const rid = Number(requesterId);
    if (requesterId === undefined || !Number.isInteger(rid) || rid <= 0 || !Number.isSafeInteger(rid)) {
      return sendError(res, 400, "VALIDATION_FAILED", "One or more fields are invalid.", { requesterId: "requesterId must be a positive integer." });
    }
    const reqExists = await getPrisma().developmentRequester.findFirst({ where: { id: rid, isActive: true } });
    if (!reqExists) {
      return sendError(res, 400, "VALIDATION_FAILED", "One or more fields are invalid.", { requesterId: "requesterId must reference an active requester." });
    }

    // search
    let searchTrim: string | undefined;
    if (search !== undefined) {
      searchTrim = trimValue(search);
      if (searchTrim.length === 0) {
        return sendError(res, 400, "VALIDATION_FAILED", "One or more fields are invalid.", { search: "search must not be empty or whitespace only." });
      }
    }

    // categoryId
    let cid: number | undefined;
    if (categoryId !== undefined) {
      cid = Number(categoryId);
      if (!Number.isInteger(cid) || cid <= 0 || !Number.isSafeInteger(cid)) {
        return sendError(res, 400, "VALIDATION_FAILED", "One or more fields are invalid.", { categoryId: "categoryId must be a positive integer." });
      }
      const cat = await getPrisma().category.findFirst({ where: { id: cid, isActive: true } });
      if (!cat) {
        return sendError(res, 400, "VALIDATION_FAILED", "One or more fields are invalid.", {
          categoryId: "categoryId must reference an active category.",
        });
      }
    }

    // requestedPriority
    if (requestedPriority !== undefined && !isPriorityValid(requestedPriority)) {
      return sendError(res, 400, "VALIDATION_FAILED", "One or more fields are invalid.", { requestedPriority: "Invalid priority." });
    }

    // sort
    const allowedSort = new Set(["updatedAt", "ticketDate", "requestedPriority"]);
    const sortField = sort ?? "updatedAt";
    if (!allowedSort.has(sortField)) {
      return sendError(res, 400, "VALIDATION_FAILED", "One or more fields are invalid.", { sort: "Invalid sort field." });
    }

    // order
    const allowedOrder = new Set(["asc", "desc"]);
    const orderDir = (order ?? "desc").toLowerCase();
    if (!allowedOrder.has(orderDir)) {
      return sendError(res, 400, "VALIDATION_FAILED", "One or more fields are invalid.", { order: "Invalid order." });
    }

    // page
    const pageNum = page !== undefined ? Number(page) : 1;
    if (page !== undefined && (!Number.isInteger(pageNum) || pageNum < 1 || !Number.isSafeInteger(pageNum))) {
      return sendError(res, 400, "VALIDATION_FAILED", "One or more fields are invalid.", { page: "page must be >= 1." });
    }

    // pageSize
    const allowedSizes = new Set([10, 20, 50]);
    const sizeNum = pageSize !== undefined ? Number(pageSize) : 10;
    if (pageSize !== undefined && (!Number.isInteger(sizeNum) || !allowedSizes.has(sizeNum))) {
      return sendError(res, 400, "VALIDATION_FAILED", "One or more fields are invalid.", { pageSize: "pageSize must be 10, 20, or 50." });
    }

    // Build where
    const where: Record<string, unknown> = { requesterId: rid };
    if (cid !== undefined) (where as Record<string, unknown>).categoryId = cid;
    if (requestedPriority !== undefined) (where as Record<string, unknown>).requestedPriority = requestedPriority;
    if (searchTrim !== undefined) {
      (where as Record<string, unknown>).OR = [
        { summary: { contains: searchTrim, mode: "insensitive" } },
        { description: { contains: searchTrim, mode: "insensitive" } },
      ];
    }

    const prisma = getPrisma();
    // PostgreSQL preserves the declaration order of RequestedPriority
    // (LOW, MEDIUM, HIGH, CRITICAL), so Prisma can sort it in the database.
    const orderBy = [{ [sortField]: orderDir }, { id: "desc" }];
    const [totalCount, paged] = await Promise.all([
      prisma.ticket.count({ where: where as never }),
      prisma.ticket.findMany({
        where: where as never,
        orderBy: orderBy as never,
        skip: (pageNum - 1) * sizeNum,
        take: sizeNum,
        select: {
          id: true,
          ticketNumber: true,
          summary: true,
          category: { select: { id: true, name: true } },
          relatedSystem: { select: { id: true, name: true } },
          requestedPriority: true,
          currentStatus: true,
          updatedAt: true,
          requesterId: true,
        },
      }),
    ]);
    const totalPages = totalCount === 0 ? 0 : Math.ceil(totalCount / sizeNum);

    // Map to response shape
    const data = paged.map((t) => ({
      id: t.id,
      ticketNumber: t.ticketNumber,
      summary: t.summary,
      category: t.category,
      relatedSystem: t.relatedSystem,
      requestedPriority: t.requestedPriority,
      currentStatus: t.currentStatus,
      updatedAt: t.updatedAt,
      requester: { id: t.requesterId },
    }));

    res.status(200).json({
      data,
      meta: {
        page: pageNum,
        pageSize: sizeNum,
        totalCount,
        totalPages,
        hasNextPage: pageNum < totalPages,
        hasPreviousPage: pageNum > 1,
      },
    });
  } catch (err) {
    sendError(res, 500, "INTERNAL_ERROR", "An unexpected error occurred. Please try again.");
  }
});

// ---------------------------------------------------------------------------
// Lab 2 Issue 10 — Ticket Detail + Attachment lifecycle
// ---------------------------------------------------------------------------

// GET /api/tickets/:id — owned detail (FR-08, AC-10)
app.get("/api/tickets/:id", async (req: Request, res: Response) => {
  try {
    const rawRid = req.query.requesterId as string | undefined;
    if (rawRid === undefined) {
      return sendError(res, 400, "VALIDATION_FAILED", "One or more fields are invalid.", { requesterId: "requesterId is required." });
    }
    if (typeof rawRid !== "string") {
      return sendError(res, 400, "VALIDATION_FAILED", "One or more fields are invalid.", { requesterId: "requesterId must be a single value." });
    }
    const rid = Number(rawRid);
    if (!Number.isInteger(rid) || rid <= 0 || !Number.isSafeInteger(rid)) {
      return sendError(res, 400, "VALIDATION_FAILED", "One or more fields are invalid.", { requesterId: "requesterId must be a positive integer." });
    }
    const reqExists = await getPrisma().developmentRequester.findFirst({ where: { id: rid, isActive: true } });
    if (!reqExists) {
      return sendError(res, 400, "VALIDATION_FAILED", "One or more fields are invalid.", { requesterId: "requesterId must reference an active requester." });
    }
    const rawId = req.params.id;
    const id = Number(rawId);
    if (!Number.isInteger(id) || id <= 0 || !Number.isSafeInteger(id)) {
      return sendError(res, 400, "VALIDATION_FAILED", "One or more fields are invalid.", { id: "Invalid ticket id." });
    }
    const ticket = await getPrisma().ticket.findFirst({
      where: { id, requesterId: rid },
      include: {
        category: { select: { id: true, name: true } },
        relatedSystem: { select: { id: true, name: true } },
        requester: { select: { id: true, name: true, email: true } },
        attachments: { orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: { id: true, originalFilename: true, mimeType: true, sizeBytes: true, removedAt: true, removedReason: true, createdAt: true } },
      },
    });
    if (!ticket) {
      return sendError(res, 404, "NOT_FOUND", "Resource not found.");
    }
    res.status(200).json({
      id: ticket.id,
      ticketNumber: ticket.ticketNumber,
      ticketDate: ticket.ticketDate,
      currentStatus: ticket.currentStatus,
      requestedPriority: ticket.requestedPriority,
      summary: ticket.summary,
      description: ticket.description,
      category: ticket.category,
      relatedSystem: ticket.relatedSystem,
      requester: ticket.requester,
      createdAt: ticket.createdAt,
      updatedAt: ticket.updatedAt,
      attachments: ticket.attachments,
    });
  } catch {
    sendError(res, 500, "INTERNAL_ERROR", "An unexpected error occurred. Please try again.");
  }
});

// POST /api/tickets/:id/attachments — upload (FR-09) — memoryStorage → validate → transaction count+create → write (no orphan, race-safe)
app.post("/api/tickets/:id/attachments", (req: Request, res: Response) => {
  upload.single("file")(req, res, async (err: unknown) => {
    try {
      if (err) {
        const msg = err instanceof Error ? err.message : "";
        if (msg === "415") return sendError(res, 415, "UNSUPPORTED_MEDIA_TYPE", "File type not allowed.");
        if ((err as { code?: string }).code === "LIMIT_FILE_SIZE") return sendError(res, 413, "PAYLOAD_TOO_LARGE", "File too large. Max 5 MB.");
        return sendError(res, 400, "VALIDATION_FAILED", "Invalid file.", { file: "Invalid file." });
      }
      const rawRid = req.query.requesterId as string | undefined;
      if (rawRid === undefined || typeof rawRid !== "string") {
        return sendError(res, 400, "VALIDATION_FAILED", "One or more fields are invalid.", { requesterId: "requesterId is required." });
      }
      const rid = Number(rawRid);
      if (!Number.isInteger(rid) || rid <= 0 || !Number.isSafeInteger(rid)) {
        return sendError(res, 400, "VALIDATION_FAILED", "One or more fields are invalid.", { requesterId: "requesterId must be a positive integer." });
      }
      const reqExists = await getPrisma().developmentRequester.findFirst({ where: { id: rid, isActive: true } });
      if (!reqExists) {
        return sendError(res, 400, "VALIDATION_FAILED", "One or more fields are invalid.", { requesterId: "requesterId must reference an active requester." });
      }
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0 || !Number.isSafeInteger(id)) {
        return sendError(res, 400, "VALIDATION_FAILED", "One or more fields are invalid.", { id: "Invalid ticket id." });
      }
      const ticket = await getPrisma().ticket.findFirst({ where: { id, requesterId: rid } });
      if (!ticket) {
        return sendError(res, 404, "NOT_FOUND", "Resource not found.");
      }
      if (!req.file) {
        return sendError(res, 400, "VALIDATION_FAILED", "One or more fields are invalid.", { file: "File is required." });
      }
      const ext = path.extname(req.file.originalname).toLowerCase();
      const storedFilename = `${uuid()}${ext}`;
      const fileBuffer = (req.file as unknown as { buffer: Buffer }).buffer;
      if (!isAllowedSignature(fileBuffer, req.file.mimetype)) {
        return sendError(res, 415, "UNSUPPORTED_MEDIA_TYPE", "File type not allowed.");
      }
      // Race-safe: serialize per ticket via FOR UPDATE lock before count+create
      let attachment: { id: number; ticketId: number; originalFilename: string; mimeType: string; sizeBytes: number; removedAt: Date | null; removedReason: string | null; createdAt: Date };
      try {
        attachment = await getPrisma().$transaction(async (tx) => {
          // Serialize concurrent uploads for same ticket
          await (tx as unknown as { $executeRaw: (q: TemplateStringsArray, ...a: unknown[]) => Promise<unknown> }).$executeRaw`SELECT id FROM "Ticket" WHERE id = ${id} FOR UPDATE`;
          const activeCount = await (tx as unknown as ReturnType<typeof getPrisma>).attachment.count({ where: { ticketId: id, removedAt: null } });
          if (activeCount >= MAX_ACTIVE) throw new Error("LIMIT_REACHED");
          return (tx as unknown as ReturnType<typeof getPrisma>).attachment.create({
            data: {
              ticketId: id,
              originalFilename: req.file!.originalname,
              storedFilename,
              mimeType: req.file!.mimetype,
              sizeBytes: req.file!.size,
            },
            select: { id: true, ticketId: true, originalFilename: true, mimeType: true, sizeBytes: true, removedAt: true, removedReason: true, createdAt: true },
          });
        });
      } catch (e) {
        if (e instanceof Error && e.message === "LIMIT_REACHED") {
          return sendError(res, 409, "CONFLICT", "Maximum of 5 active attachments reached.");
        }
        throw e;
      }
      // Write file only after DB success — no orphan on reject
      try {
        fs.writeFileSync(path.join(UPLOAD_DIR, storedFilename), fileBuffer);
      } catch {
        // Rollback DB record if write fails
        try { await getPrisma().attachment.delete({ where: { id: attachment!.id } }); } catch { /* ignore */ }
        return sendError(res, 500, "INTERNAL_ERROR", "An unexpected error occurred. Please try again.");
      }
      res.status(201).json(attachment!);
    } catch {
      sendError(res, 500, "INTERNAL_ERROR", "An unexpected error occurred. Please try again.");
    }
  });
});

// GET /api/attachments/:id — metadata (FR-10)
app.get("/api/attachments/:id", async (req: Request, res: Response) => {
  try {
    const rawRid = req.query.requesterId as string | undefined;
    if (rawRid === undefined || typeof rawRid !== "string") return sendError(res, 400, "VALIDATION_FAILED", "One or more fields are invalid.", { requesterId: "requesterId is required." });
    const rid = Number(rawRid);
    if (!Number.isInteger(rid) || rid <= 0 || !Number.isSafeInteger(rid)) return sendError(res, 400, "VALIDATION_FAILED", "One or more fields are invalid.", { requesterId: "requesterId must be a positive integer." });
    const reqExists = await getPrisma().developmentRequester.findFirst({ where: { id: rid, isActive: true } });
    if (!reqExists) return sendError(res, 400, "VALIDATION_FAILED", "One or more fields are invalid.", { requesterId: "requesterId must reference an active requester." });
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0 || !Number.isSafeInteger(id)) return sendError(res, 400, "VALIDATION_FAILED", "One or more fields are invalid.", { id: "Invalid attachment id." });
    const att = await getPrisma().attachment.findUnique({ where: { id }, include: { ticket: true } });
    if (!att || att.ticket.requesterId !== rid) return sendError(res, 404, "NOT_FOUND", "Resource not found.");
    res.status(200).json({ id: att.id, ticketId: att.ticketId, originalFilename: att.originalFilename, mimeType: att.mimeType, sizeBytes: att.sizeBytes, removedAt: att.removedAt, removedReason: att.removedReason, createdAt: att.createdAt });
  } catch { sendError(res, 500, "INTERNAL_ERROR", "An unexpected error occurred. Please try again."); }
});

// GET /api/attachments/:id/download — binary (FR-10, BR-17)
app.get("/api/attachments/:id/download", async (req: Request, res: Response) => {
  try {
    const rawRid = req.query.requesterId as string | undefined;
    if (rawRid === undefined || typeof rawRid !== "string") return sendError(res, 400, "VALIDATION_FAILED", "One or more fields are invalid.", { requesterId: "requesterId is required." });
    const rid = Number(rawRid);
    if (!Number.isInteger(rid) || rid <= 0 || !Number.isSafeInteger(rid)) return sendError(res, 400, "VALIDATION_FAILED", "One or more fields are invalid.", { requesterId: "requesterId must be a positive integer." });
    const reqExists = await getPrisma().developmentRequester.findFirst({ where: { id: rid, isActive: true } });
    if (!reqExists) return sendError(res, 400, "VALIDATION_FAILED", "One or more fields are invalid.", { requesterId: "requesterId must reference an active requester." });
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0 || !Number.isSafeInteger(id)) return sendError(res, 400, "VALIDATION_FAILED", "One or more fields are invalid.", { id: "Invalid attachment id." });
    const att = await getPrisma().attachment.findUnique({ where: { id }, include: { ticket: true } });
    if (!att || att.ticket.requesterId !== rid || att.removedAt) return sendError(res, 404, "NOT_FOUND", "Resource not found.");
    const filePath = path.join(UPLOAD_DIR, att.storedFilename);
    if (!fs.existsSync(filePath)) return sendError(res, 404, "NOT_FOUND", "Resource not found.");
    res.setHeader("Content-Type", att.mimeType);
    const safeFallback = att.originalFilename.replace(/[^\x20-\x7E]/g, "_").replace(/"/g, "_").replace(/\n/g, "_").replace(/\r/g, "_");
    const encoded = encodeURIComponent(att.originalFilename).replace(/'/g, "%27");
    res.setHeader("Content-Disposition", `attachment; filename="${safeFallback}"; filename*=UTF-8''${encoded}`);
    res.sendFile(filePath);
  } catch { sendError(res, 500, "INTERNAL_ERROR", "An unexpected error occurred. Please try again."); }
});

// POST /api/attachments/:id/remove — soft-remove (FR-10, BR-15/16)
app.post("/api/attachments/:id/remove", async (req: Request, res: Response) => {
  try {
    const rawRid = req.query.requesterId as string | undefined;
    if (rawRid === undefined || typeof rawRid !== "string") return sendError(res, 400, "VALIDATION_FAILED", "One or more fields are invalid.", { requesterId: "requesterId is required." });
    const rid = Number(rawRid);
    if (!Number.isInteger(rid) || rid <= 0 || !Number.isSafeInteger(rid)) return sendError(res, 400, "VALIDATION_FAILED", "One or more fields are invalid.", { requesterId: "requesterId must be a positive integer." });
    const reqExists = await getPrisma().developmentRequester.findFirst({ where: { id: rid, isActive: true } });
    if (!reqExists) return sendError(res, 400, "VALIDATION_FAILED", "One or more fields are invalid.", { requesterId: "requesterId must reference an active requester." });
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0 || !Number.isSafeInteger(id)) return sendError(res, 400, "VALIDATION_FAILED", "One or more fields are invalid.", { id: "Invalid attachment id." });
    const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
    if (!reason) return sendError(res, 400, "VALIDATION_FAILED", "One or more fields are invalid.", { reason: "Reason is required." });
    const att = await getPrisma().attachment.findUnique({ where: { id }, include: { ticket: true } });
    if (!att || att.ticket.requesterId !== rid) return sendError(res, 404, "NOT_FOUND", "Resource not found.");
    // Conditional update to avoid race where two removes succeed
    const result = await getPrisma().attachment.updateMany({ where: { id, removedAt: null }, data: { removedAt: new Date(), removedReason: reason } });
    if (result.count === 0) return sendError(res, 409, "CONFLICT", "Already removed.");
    const updated = await getPrisma().attachment.findUnique({ where: { id }, select: { id: true, removedAt: true, removedReason: true } });
    res.status(200).json({ id: updated!.id, removedAt: updated!.removedAt, removedReason: updated!.removedReason });
  } catch { sendError(res, 500, "INTERNAL_ERROR", "An unexpected error occurred. Please try again."); }
});

// ---------------------------------------------------------------------------
// Lab 2 Issue 8 — Create Ticket
// POST /api/tickets — validates, generates ticketNumber, persists with status NEW
// ---------------------------------------------------------------------------
app.post("/api/tickets", async (req: Request, res: Response) => {
  try {
    const { requesterId, categoryId, relatedSystemId, summary, description, requestedPriority } = req.body ?? {};

    const fieldErrors: Record<string, string> = {};

    // requesterId — must be existing active
    const rid = Number(requesterId);
    if (requesterId === undefined || requesterId === null || !Number.isInteger(rid) || rid <= 0) {
      fieldErrors.requesterId = "requesterId must be a positive integer.";
    } else {
      const reqExists = await getPrisma().developmentRequester.findFirst({ where: { id: rid, isActive: true } });
      if (!reqExists) fieldErrors.requesterId = "requesterId must reference an active requester.";
    }

    // categoryId
    const cid = Number(categoryId);
    if (categoryId === undefined || categoryId === null || !Number.isInteger(cid) || cid <= 0) {
      fieldErrors.categoryId = "categoryId is required.";
    } else {
      const cat = await getPrisma().category.findFirst({ where: { id: cid, isActive: true } });
      if (!cat) fieldErrors.categoryId = "categoryId must reference an active category.";
    }

    // relatedSystemId
    const rsid = Number(relatedSystemId);
    if (relatedSystemId === undefined || relatedSystemId === null || !Number.isInteger(rsid) || rsid <= 0) {
      fieldErrors.relatedSystemId = "relatedSystemId is required.";
    } else {
      const rs = await getPrisma().relatedSystem.findFirst({ where: { id: rsid, isActive: true } });
      if (!rs) fieldErrors.relatedSystemId = "relatedSystemId must reference an active related system.";
    }

    // summary
    if (typeof summary !== "string" || !isSummaryValid(summary)) {
      fieldErrors.summary = "Summary must contain 5–120 characters.";
    }

    // description
    if (typeof description !== "string" || !isDescriptionValid(description)) {
      fieldErrors.description = "Description must contain 20–2,000 characters.";
    }

    // requestedPriority
    if (typeof requestedPriority !== "string" || !isPriorityValid(requestedPriority)) {
      fieldErrors.requestedPriority = "requestedPriority must be one of LOW, MEDIUM, HIGH, CRITICAL.";
    }

    if (Object.keys(fieldErrors).length > 0) {
      return sendError(res, 400, "VALIDATION_FAILED", "One or more fields are invalid.", fieldErrors);
    }

    const trimmedSummary = trimValue(summary as string);
    const trimmedDescription = trimValue(description as string);

    const prisma = getPrisma();
    const ticket = await prisma.$transaction(async (tx) => {
      const yyMm = formatYYMM(new Date());
      const seq = await getNextSequence(tx as unknown as Parameters<typeof getNextSequence>[0], yyMm);
      if (seq > 9999) throw new Error("SEQUENCE_EXHAUSTED");
      const ticketNumber = formatTicketNumber(yyMm, seq);
      return (tx as unknown as typeof prisma).ticket.create({
        data: {
          ticketNumber,
          requesterId: rid,
          categoryId: cid,
          relatedSystemId: rsid,
          summary: trimmedSummary,
          description: trimmedDescription,
          requestedPriority: requestedPriority as never,
          currentStatus: "NEW",
        },
        include: {
          category: { select: { id: true, name: true } },
          relatedSystem: { select: { id: true, name: true } },
          requester: { select: { id: true, name: true } },
        },
      });
    });

    // Shape per api-spec §5.1
    res.status(201).json({
      id: (ticket as unknown as { id: number }).id,
      ticketNumber: (ticket as unknown as { ticketNumber: string }).ticketNumber,
      ticketDate: (ticket as unknown as { ticketDate: Date }).ticketDate,
      currentStatus: (ticket as unknown as { currentStatus: string }).currentStatus,
      requestedPriority: (ticket as unknown as { requestedPriority: string }).requestedPriority,
      summary: (ticket as unknown as { summary: string }).summary,
      description: (ticket as unknown as { description: string }).description,
      category: (ticket as unknown as { category: { id: number; name: string } }).category,
      relatedSystem: (ticket as unknown as { relatedSystem: { id: number; name: string } }).relatedSystem,
      requester: (ticket as unknown as { requester: { id: number; name: string } }).requester,
      attachments: [],
    });
  } catch (err) {
    if (err instanceof Error && err.message === "SEQUENCE_EXHAUSTED") {
      return sendError(res, 500, "INTERNAL_ERROR", "An unexpected error occurred. Please try again.");
    }
    // Unique constraint violation (race) — treat as 500 safe
    if (err instanceof Error && (err as unknown as { code?: string }).code === "P2002") {
      return sendError(res, 500, "INTERNAL_ERROR", "An unexpected error occurred. Please try again.");
    }
    sendError(res, 500, "INTERNAL_ERROR", "An unexpected error occurred. Please try again.");
  }
});

export default app;
