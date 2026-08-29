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
// getPrisma() is your lazy database handle. Call it INSIDE a route when you
// need the DB (Issue 4).

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
