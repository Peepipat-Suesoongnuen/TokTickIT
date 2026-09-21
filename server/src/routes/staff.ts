import { Router, type Request, type Response } from "express";
import { getPrisma } from "../prisma.js";
import { sendError } from "../lib/errors.js";
import { trimValue, isPriorityValid } from "../lib/validation.js";
import {
  requireActiveUser,
  requireOrigin,
  requirePasswordChanged,
  requireRole,
  requireSession,
  type AuthRequest,
} from "../auth.js";
import { isOwnerEligible, lockUserRowForUpdate } from "../lib/owner-integrity.js";
import { isTransitionAllowed, statusRequiresOwner } from "../lib/ticket-status.js";
import { isInternalNoteValid, normalizeMessageContent } from "../lib/validation.js";

// Issue #48 (Lab 3) — IT Staff Ticket workspace (api-spec §§8–11).
//
// All routes authorize IT_STAFF and, by the explicit project matrix
// (specification.md §5 Authorization matrix), ADMINISTRATOR. Requester
// receives 403 FORBIDDEN before Ticket-specific data is exposed.

export const STAFF_ROLES = ["IT_STAFF", "ADMINISTRATOR"] as const;

const STAFF_GUARD = [
  requireSession,
  requireActiveUser,
  requirePasswordChanged,
  requireRole(...STAFF_ROLES),
];

export const TICKET_STATUSES = new Set([
  "NEW",
  "OPEN",
  "IN_PROGRESS",
  "WAITING_FOR_REQUESTER",
  "RESOLVED",
  "CLOSED",
  "REOPENED",
  "CANCELLED",
]);

function invalid(res: Response, fieldErrors: Record<string, string>): void {
  sendError(res, 400, "VALIDATION_FAILED", "One or more fields are invalid.", fieldErrors);
}

function parsePositiveInt(raw: string): number | null {
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0 || !Number.isSafeInteger(n)) return null;
  return n;
}

export const staffRouter = Router();

// ---------------------------------------------------------------------------
// GET /api/staff/tickets — shared Ticket Queue (api-spec §8)
// ---------------------------------------------------------------------------
staffRouter.get("/tickets", ...STAFF_GUARD, async (req: Request, res: Response) => {
  try {
    const allowed = new Set([
      "search",
      "categoryId",
      "requestedPriority",
      "itPriority",
      "currentStatus",
      "owner",
      "sort",
      "order",
      "page",
      "pageSize",
    ]);
    for (const k of Object.keys(req.query)) {
      if (!allowed.has(k)) {
        return invalid(res, { [k]: "Unknown parameter." });
      }
    }

    // Duplicate/malformed query values arrive as string[] -> 400 (BR-65).
    for (const p of allowed) {
      const v = (req.query as Record<string, unknown>)[p];
      if (v !== undefined && typeof v !== "string") {
        return invalid(res, { [p]: `${p} must be a single value.` });
      }
    }

    const { search, categoryId, requestedPriority, itPriority, currentStatus, owner, sort, order, page, pageSize } =
      req.query as Record<string, string | undefined>;

    // search (case-insensitive partial Ticket Number, Summary, Requester
    // name, or Requester email; Description is not searched).
    let searchTrim: string | undefined;
    if (search !== undefined) {
      searchTrim = trimValue(search);
      if (searchTrim.length === 0) {
        return invalid(res, { search: "search must not be empty or whitespace only." });
      }
    }

    // categoryId (active Category positive integer).
    let cid: number | undefined;
    if (categoryId !== undefined) {
      const n = parsePositiveInt(categoryId);
      if (n === null) {
        return invalid(res, { categoryId: "categoryId must be a positive integer." });
      }
      const cat = await getPrisma().category.findFirst({ where: { id: n, isActive: true } });
      if (!cat) {
        return invalid(res, { categoryId: "categoryId must reference an active category." });
      }
      cid = n;
    }

    if (requestedPriority !== undefined && !isPriorityValid(requestedPriority)) {
      return invalid(res, { requestedPriority: "Invalid priority." });
    }
    if (itPriority !== undefined && !isPriorityValid(itPriority)) {
      return invalid(res, { itPriority: "Invalid priority." });
    }
    if (currentStatus !== undefined && !TICKET_STATUSES.has(currentStatus)) {
      return invalid(res, { currentStatus: "Invalid current status." });
    }

    // owner: `unassigned`, `me`, or a positive User ID. Filtering may target
    // a historical owner even if no longer eligible; assignment eligibility
    // is enforced only by assignment operations. Nonexistent IDs are invalid.
    type OwnerFilter = { mode: "unassigned" } | { mode: "me" } | { mode: "id"; id: number };
    let ownerFilter: OwnerFilter | undefined;
    if (owner !== undefined) {
      if (owner === "unassigned") {
        ownerFilter = { mode: "unassigned" };
      } else if (owner === "me") {
        ownerFilter = { mode: "me" };
      } else {
        const n = parsePositiveInt(owner);
        if (n === null) {
          return invalid(res, { owner: "owner must be unassigned, me, or a positive user id." });
        }
        const target = await getPrisma().user.findUnique({ where: { id: n }, select: { id: true } });
        if (!target) {
          return invalid(res, { owner: "owner must reference an existing user." });
        }
        ownerFilter = { mode: "id", id: n };
      }
    }

    // sort / order.
    const allowedSort = new Set(["updatedAt", "ticketDate", "ticketNumber", "requestedPriority", "itPriority"]);
    if (sort !== undefined && !allowedSort.has(sort)) {
      return invalid(res, { sort: "Invalid sort field." });
    }
    const allowedOrder = new Set(["asc", "desc"]);
    const orderDir = (order ?? "desc").toLowerCase();
    if (!allowedOrder.has(orderDir)) {
      return invalid(res, { order: "Invalid order." });
    }

    const pageNum = page !== undefined ? Number(page) : 1;
    if (page !== undefined && (!Number.isInteger(pageNum) || pageNum < 1 || !Number.isSafeInteger(pageNum))) {
      return invalid(res, { page: "page must be >= 1." });
    }
    const allowedSizes = new Set([10, 20, 50]);
    const sizeNum = pageSize !== undefined ? Number(pageSize) : 10;
    if (pageSize !== undefined && (!Number.isInteger(sizeNum) || !allowedSizes.has(sizeNum))) {
      return invalid(res, { pageSize: "pageSize must be 10, 20, or 50." });
    }

    // Build where.
    const where: Record<string, unknown> = {};
    if (cid !== undefined) where.categoryId = cid;
    if (requestedPriority !== undefined) where.requestedPriority = requestedPriority;
    if (itPriority !== undefined) where.itPriority = itPriority;
    if (currentStatus !== undefined) where.currentStatus = currentStatus;
    if (ownerFilter !== undefined) {
      if (ownerFilter.mode === "unassigned") {
        where.ticketOwnerId = null;
      } else if (ownerFilter.mode === "me") {
        const me = (req as AuthRequest).user;
        if (!me) {
          sendError(res, 401, "UNAUTHENTICATED", "Authentication required.");
          return;
        }
        where.ticketOwnerId = me.id;
      } else {
        where.ticketOwnerId = ownerFilter.id;
      }
    }
    if (searchTrim !== undefined) {
      where.OR = [
        { ticketNumber: { contains: searchTrim, mode: "insensitive" } },
        { summary: { contains: searchTrim, mode: "insensitive" } },
        { requester: { is: { name: { contains: searchTrim, mode: "insensitive" } } } },
        { requester: { is: { email: { contains: searchTrim, mode: "insensitive" } } } },
      ];
    }

    const prisma = getPrisma();
    // Default ordering: itPriority DESC by explicit LOW < MEDIUM < HIGH <
    // CRITICAL rank (PostgreSQL enum declaration order), updatedAt DESC,
    // id DESC. Prisma orders the enum by its declaration order, so DESC
    // yields CRITICAL first.
    const orderBy =
      sort === undefined
        ? [{ itPriority: "desc" }, { updatedAt: "desc" }, { id: "desc" }]
        : [{ [sort]: orderDir }, { id: "desc" }];

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
          ticketDate: true,
          summary: true,
          requester: { select: { id: true, name: true } },
          category: { select: { id: true, name: true } },
          requestedPriority: true,
          itPriority: true,
          currentStatus: true,
          owner: { select: { id: true, name: true } },
          requesterResolutionIndicatedAt: true,
          updatedAt: true,
        },
      }),
    ]);
    const totalPages = totalCount === 0 ? 0 : Math.ceil(totalCount / sizeNum);

    const data = paged.map((t) => ({
      id: t.id,
      ticketNumber: t.ticketNumber,
      ticketDate: t.ticketDate,
      summary: t.summary,
      requester: t.requester,
      category: t.category,
      requestedPriority: t.requestedPriority,
      itPriority: t.itPriority,
      currentStatus: t.currentStatus,
      ticketOwner: t.owner,
      requesterResolutionIndicatedAt: t.requesterResolutionIndicatedAt,
      updatedAt: t.updatedAt,
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

export default staffRouter;

// ---------------------------------------------------------------------------
// Shared mutation response shape (api-spec §§9–11): the affected Ticket's
// operational state after the mutation.
// ---------------------------------------------------------------------------
interface MutationTicket {
  id: number;
  ticketNumber: string;
  currentStatus: string;
  requestedPriority: string;
  itPriority: string;
  ticketOwner: { id: number; name: string; role: string } | null;
  requesterResolutionIndicatedAt: Date | null;
  updatedAt: Date;
}

async function readMutationTicket(id: number): Promise<MutationTicket | null> {
  const t = await getPrisma().ticket.findUnique({
    where: { id },
    select: {
      id: true,
      ticketNumber: true,
      currentStatus: true,
      requestedPriority: true,
      itPriority: true,
      owner: { select: { id: true, name: true, role: true } },
      requesterResolutionIndicatedAt: true,
      updatedAt: true,
    },
  });
  if (!t) return null;
  return {
    id: t.id,
    ticketNumber: t.ticketNumber,
    currentStatus: t.currentStatus,
    requestedPriority: t.requestedPriority,
    itPriority: t.itPriority,
    ticketOwner: t.owner,
    requesterResolutionIndicatedAt: t.requesterResolutionIndicatedAt,
    updatedAt: t.updatedAt,
  };
}

function conflict(res: Response, code: string, message: string): void {
  sendError(res, 409, code, message);
}

// ---------------------------------------------------------------------------
// GET /api/staff/tickets/:id — shared Ticket Detail (api-spec §9.1)
// ---------------------------------------------------------------------------
staffRouter.get("/tickets/:id", ...STAFF_GUARD, async (req: Request, res: Response) => {
  try {
    const id = parsePositiveInt(req.params.id);
    if (id === null) {
      return invalid(res, { id: "Ticket id must be a positive integer." });
    }
    const ticket = await getPrisma().ticket.findUnique({
      where: { id },
      select: {
        id: true,
        ticketNumber: true,
        ticketDate: true,
        requester: { select: { id: true, name: true, email: true } },
        category: { select: { id: true, name: true } },
        relatedSystem: { select: { id: true, name: true } },
        summary: true,
        description: true,
        requestedPriority: true,
        itPriority: true,
        currentStatus: true,
        owner: { select: { id: true, name: true, role: true } },
        requesterResolutionIndicatedAt: true,
        attachments: {
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          select: {
            id: true,
            originalFilename: true,
            mimeType: true,
            sizeBytes: true,
            removedAt: true,
            removedReason: true,
            createdAt: true,
          },
        },
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!ticket) {
      return sendError(res, 404, "TICKET_NOT_FOUND", "Ticket not found.");
    }
    res.status(200).json({
      id: ticket.id,
      ticketNumber: ticket.ticketNumber,
      ticketDate: ticket.ticketDate,
      requester: ticket.requester,
      category: ticket.category,
      relatedSystem: ticket.relatedSystem,
      summary: ticket.summary,
      description: ticket.description,
      requestedPriority: ticket.requestedPriority,
      itPriority: ticket.itPriority,
      currentStatus: ticket.currentStatus,
      ticketOwner: ticket.owner,
      requesterResolutionIndicatedAt: ticket.requesterResolutionIndicatedAt,
      attachments: ticket.attachments,
      createdAt: ticket.createdAt,
      updatedAt: ticket.updatedAt,
    });
  } catch (err) {
    sendError(res, 500, "INTERNAL_ERROR", "An unexpected error occurred. Please try again.");
  }
});

// ---------------------------------------------------------------------------
// GET /api/staff/ticket-owners — eligible owner picker (api-spec §9.2)
// ---------------------------------------------------------------------------
staffRouter.get("/ticket-owners", ...STAFF_GUARD, async (_req: Request, res: Response) => {
  try {
    const owners = await getPrisma().user.findMany({
      where: { isActive: true, role: { in: ["IT_STAFF", "ADMINISTRATOR"] } },
      select: { id: true, name: true, role: true },
      orderBy: { name: "asc" },
    });
    res.status(200).json({ data: owners });
  } catch (err) {
    sendError(res, 500, "INTERNAL_ERROR", "An unexpected error occurred. Please try again.");
  }
});

// ---------------------------------------------------------------------------
// POST /api/staff/tickets/:id/claim — first Claim (api-spec §9.3)
// ---------------------------------------------------------------------------
staffRouter.post(
  "/tickets/:id/claim",
  requireOrigin,
  ...STAFF_GUARD,
  async (req: Request, res: Response) => {
    try {
      const id = parsePositiveInt(req.params.id);
      if (id === null) {
        return invalid(res, { id: "Ticket id must be a positive integer." });
      }
      const body = (req.body ?? {}) as Record<string, unknown>;
      if (Object.keys(body).length > 0) {
        const extras: Record<string, string> = {};
        for (const k of Object.keys(body)) extras[k] = "Unknown parameter.";
        return invalid(res, extras);
      }
      const me = (req as AuthRequest).user;
      if (!me) {
        sendError(res, 401, "UNAUTHENTICATED", "Authentication required.");
        return;
      }

      const outcome = await getPrisma().$transaction(async (tx) => {
        // BR-76: serialize on the claimant row; revalidate eligibility at
        // commit time against a concurrent Administrator deactivate/demote.
        const claimant = await lockUserRowForUpdate(tx, me.id);
        if (!isOwnerEligible(claimant)) {
          return { kind: "ineligible" } as const;
        }
        const current = await tx.ticket.findUnique({
          where: { id },
          select: { id: true, ticketOwnerId: true, currentStatus: true },
        });
        if (!current) return { kind: "missing" } as const;
        if (current.ticketOwnerId !== null) return { kind: "assigned" } as const;
        if (current.currentStatus !== "NEW") return { kind: "invalid-state" } as const;
        const updated = await tx.ticket.updateMany({
          where: { id, ticketOwnerId: null, currentStatus: "NEW" },
          data: { ticketOwnerId: me.id, currentStatus: "OPEN" },
        });
        if (updated.count === 0) {
          // Lost a concurrent Claim/Assign: re-read to report precisely.
          const after = await tx.ticket.findUnique({
            where: { id },
            select: { ticketOwnerId: true, currentStatus: true },
          });
          if (!after) return { kind: "missing" } as const;
          if (after.ticketOwnerId !== null) return { kind: "assigned" } as const;
          return { kind: "stale" } as const;
        }
        return { kind: "ok" } as const;
      });

      if (outcome.kind === "missing") {
        return sendError(res, 404, "TICKET_NOT_FOUND", "Ticket not found.");
      }
      if (outcome.kind === "ineligible") {
        return conflict(res, "OWNER_NOT_ELIGIBLE", "The selected ticket owner is no longer eligible. Refresh and try again.");
      }
      if (outcome.kind === "assigned") {
        return conflict(res, "TICKET_ALREADY_ASSIGNED", "The ticket is already assigned to another owner.");
      }
      if (outcome.kind === "invalid-state") {
        return conflict(res, "INVALID_TICKET_STATE", "The ticket is not in a state that allows this operation.");
      }
      if (outcome.kind === "stale") {
        return conflict(res, "TICKET_STATE_CHANGED", "The ticket has changed. Refresh and try again.");
      }
      const ticket = await readMutationTicket(id);
      res.status(200).json(ticket);
    } catch (err) {
      sendError(res, 500, "INTERNAL_ERROR", "An unexpected error occurred. Please try again.");
    }
  }
);

// ---------------------------------------------------------------------------
// PATCH /api/staff/tickets/:id/it-priority (api-spec §10)
// ---------------------------------------------------------------------------
staffRouter.patch(
  "/tickets/:id/it-priority",
  requireOrigin,
  ...STAFF_GUARD,
  async (req: Request, res: Response) => {
    try {
      const id = parsePositiveInt(req.params.id);
      if (id === null) {
        return invalid(res, { id: "Ticket id must be a positive integer." });
      }
      const body = (req.body ?? {}) as Record<string, unknown>;
      const allowedKeys = new Set(["itPriority", "expectedItPriority"]);
      for (const k of Object.keys(body)) {
        if (!allowedKeys.has(k)) {
          return invalid(res, { [k]: "Unknown parameter." });
        }
      }
      if (!("itPriority" in body) || !("expectedItPriority" in body)) {
        return invalid(res, { itPriority: "itPriority and expectedItPriority are required." });
      }
      if (typeof body.itPriority !== "string" || !isPriorityValid(body.itPriority)) {
        return invalid(res, { itPriority: "Invalid priority." });
      }
      if (typeof body.expectedItPriority !== "string" || !isPriorityValid(body.expectedItPriority)) {
        return invalid(res, { expectedItPriority: "Invalid priority." });
      }

      const outcome = await getPrisma().$transaction(async (tx) => {
        const current = await tx.ticket.findUnique({
          where: { id },
          select: { id: true, itPriority: true, currentStatus: true },
        });
        if (!current) return { kind: "missing" } as const;
        if (current.currentStatus === "CLOSED" || current.currentStatus === "CANCELLED") {
          return { kind: "invalid-state" } as const;
        }
        if (current.itPriority !== body.expectedItPriority) {
          return { kind: "stale" } as const;
        }
        if (current.itPriority === body.itPriority) {
          return { kind: "ok" } as const;
        }
        const updated = await tx.ticket.updateMany({
          where: { id, itPriority: body.expectedItPriority as never },
          data: { itPriority: body.itPriority as never },
        });
        if (updated.count === 0) {
          return { kind: "stale" } as const;
        }
        return { kind: "ok" } as const;
      });

      if (outcome.kind === "missing") {
        return sendError(res, 404, "TICKET_NOT_FOUND", "Ticket not found.");
      }
      if (outcome.kind === "invalid-state") {
        return conflict(res, "INVALID_TICKET_STATE", "The ticket is not in a state that allows this operation.");
      }
      if (outcome.kind === "stale") {
        return conflict(res, "TICKET_STATE_CHANGED", "The ticket has changed. Refresh and try again.");
      }
      const ticket = await readMutationTicket(id);
      res.status(200).json(ticket);
    } catch (err) {
      sendError(res, 500, "INTERNAL_ERROR", "An unexpected error occurred. Please try again.");
    }
  }
);

// ---------------------------------------------------------------------------
// PATCH /api/staff/tickets/:id/status (api-spec §11)
// ---------------------------------------------------------------------------
staffRouter.patch(
  "/tickets/:id/status",
  requireOrigin,
  ...STAFF_GUARD,
  async (req: Request, res: Response) => {
    try {
      const id = parsePositiveInt(req.params.id);
      if (id === null) {
        return invalid(res, { id: "Ticket id must be a positive integer." });
      }
      const body = (req.body ?? {}) as Record<string, unknown>;
      const allowedKeys = new Set(["status", "expectedCurrentStatus", "ownerId"]);
      for (const k of Object.keys(body)) {
        if (!allowedKeys.has(k)) {
          return invalid(res, { [k]: "Unknown parameter." });
        }
      }
      if (!("status" in body) || !("expectedCurrentStatus" in body)) {
        return invalid(res, { status: "status and expectedCurrentStatus are required." });
      }
      if (typeof body.status !== "string" || !TICKET_STATUSES.has(body.status)) {
        return invalid(res, { status: "Invalid status." });
      }
      if (typeof body.expectedCurrentStatus !== "string" || !TICKET_STATUSES.has(body.expectedCurrentStatus)) {
        return invalid(res, { expectedCurrentStatus: "Invalid status." });
      }
      const rawOwner = body.ownerId;
      if (rawOwner !== undefined && (typeof rawOwner !== "number" || !Number.isInteger(rawOwner) || rawOwner <= 0 || !Number.isSafeInteger(rawOwner))) {
        return invalid(res, { ownerId: "ownerId must be a positive integer." });
      }
      const next = body.status as string;
      const expected = body.expectedCurrentStatus as string;

      // Processing order (api-spec §11): expected-state comparison comes
      // before transition validation, so a mismatched expectation reports
      // TICKET_STATE_CHANGED even when the requested move is also unlisted.
      const precheck = await getPrisma().ticket.findUnique({
        where: { id },
        select: { currentStatus: true },
      });
      if (!precheck) {
        return sendError(res, 404, "TICKET_NOT_FOUND", "Ticket not found.");
      }
      if (precheck.currentStatus !== expected) {
        return conflict(res, "TICKET_STATE_CHANGED", "The ticket has changed. Refresh and try again.");
      }

      // NEW → OPEN occurs only through first Claim/Assign, never here.
      if (expected === "NEW" && next === "OPEN") {
        return conflict(res, "INVALID_STATUS_TRANSITION", "This status transition is not permitted.");
      }
      if (!isTransitionAllowed(expected, next)) {
        return conflict(res, "INVALID_STATUS_TRANSITION", "This status transition is not permitted.");
      }
      // A replacement owner travels only with CLOSED → REOPENED.
      if (rawOwner !== undefined && !(expected === "CLOSED" && next === "REOPENED")) {
        return invalid(res, { ownerId: "ownerId is only accepted for CLOSED to REOPENED with an ineligible historical owner." });
      }

      const outcome = await getPrisma().$transaction(async (tx) => {
        const current = await tx.ticket.findUnique({
          where: { id },
          select: {
            id: true,
            ticketOwnerId: true,
            currentStatus: true,
            requesterResolutionIndicatedAt: true,
          },
        });
        if (!current) return { kind: "missing" } as const;
        if (current.currentStatus !== expected) {
          return { kind: "stale" } as const;
        }

        // Resolve the post-transition owner and enforce BR-76 at commit time.
        let effectiveOwnerId: number | null = current.ticketOwnerId;
        if (expected === "CLOSED" && next === "REOPENED") {
          const historical = current.ticketOwnerId === null
            ? null
            : await lockUserRowForUpdate(tx, current.ticketOwnerId);
          if (isOwnerEligible(historical)) {
            effectiveOwnerId = current.ticketOwnerId;
          } else if (rawOwner === undefined) {
            return { kind: "owner-required" } as const;
          } else {
            const replacement = await lockUserRowForUpdate(tx, rawOwner as number);
            if (!isOwnerEligible(replacement)) {
              return { kind: "ineligible" } as const;
            }
            effectiveOwnerId = rawOwner as number;
          }
        } else if (statusRequiresOwner(next)) {
          if (current.ticketOwnerId === null) {
            return { kind: "ineligible" } as const;
          }
          const owner = await lockUserRowForUpdate(tx, current.ticketOwnerId);
          if (!isOwnerEligible(owner)) {
            return { kind: "ineligible" } as const;
          }
          effectiveOwnerId = current.ticketOwnerId;
        }

        const data: Record<string, unknown> = { currentStatus: next };
        if (effectiveOwnerId !== current.ticketOwnerId) {
          data.ticketOwnerId = effectiveOwnerId;
        }
        if (next === "REOPENED") {
          // Any Reopen clears the Requester resolution indication (BR-05).
          data.requesterResolutionIndicatedAt = null;
        }
        const updated = await tx.ticket.updateMany({
          where: { id, currentStatus: expected },
          data: data as never,
        });
        if (updated.count === 0) {
          return { kind: "stale" } as const;
        }
        return { kind: "ok" } as const;
      });

      if (outcome.kind === "missing") {
        return sendError(res, 404, "TICKET_NOT_FOUND", "Ticket not found.");
      }
      if (outcome.kind === "stale") {
        return conflict(res, "TICKET_STATE_CHANGED", "The ticket has changed. Refresh and try again.");
      }
      if (outcome.kind === "ineligible") {
        return conflict(res, "OWNER_NOT_ELIGIBLE", "The selected ticket owner is no longer eligible. Refresh and try again.");
      }
      if (outcome.kind === "owner-required") {
        return invalid(res, { ownerId: "A replacement owner is required because the historical owner is no longer eligible." });
      }
      const ticket = await readMutationTicket(id);
      res.status(200).json(ticket);
    } catch (err) {
      sendError(res, 500, "INTERNAL_ERROR", "An unexpected error occurred. Please try again.");
    }
  }
);
staffRouter.patch(
  "/tickets/:id/owner",
  requireOrigin,
  ...STAFF_GUARD,
  async (req: Request, res: Response) => {
    try {
      const id = parsePositiveInt(req.params.id);
      if (id === null) {
        return invalid(res, { id: "Ticket id must be a positive integer." });
      }
      const body = (req.body ?? {}) as Record<string, unknown>;
      const allowedKeys = new Set(["ownerId", "expectedOwnerId"]);
      for (const k of Object.keys(body)) {
        if (!allowedKeys.has(k)) {
          return invalid(res, { [k]: "Unknown parameter." });
        }
      }
      if (!("ownerId" in body) || !("expectedOwnerId" in body)) {
        return invalid(res, { ownerId: "ownerId and expectedOwnerId are required." });
      }
      const ownerId = typeof body.ownerId === "number" ? body.ownerId : NaN;
      if (!Number.isInteger(ownerId) || ownerId <= 0 || !Number.isSafeInteger(ownerId)) {
        return invalid(res, { ownerId: "ownerId must be a positive integer." });
      }
      const expectedRaw = body.expectedOwnerId;
      if (expectedRaw !== null && (typeof expectedRaw !== "number" || !Number.isInteger(expectedRaw) || expectedRaw <= 0 || !Number.isSafeInteger(expectedRaw))) {
        return invalid(res, { expectedOwnerId: "expectedOwnerId must be null or a positive integer." });
      }
      const expectedOwnerId = expectedRaw as number | null;

      const outcome = await getPrisma().$transaction(async (tx) => {
        const current = await tx.ticket.findUnique({
          where: { id },
          select: { id: true, ticketOwnerId: true, currentStatus: true },
        });
        if (!current) return { kind: "missing" } as const;
        if (current.currentStatus === "CLOSED" || current.currentStatus === "CANCELLED") {
          return { kind: "invalid-state" } as const;
        }
        if (current.ticketOwnerId !== expectedOwnerId) {
          return { kind: "stale" } as const;
        }
        // Same-owner update is idempotent when expected state matches.
        if (current.ticketOwnerId === ownerId) {
          return { kind: "ok" } as const;
        }
        // BR-76: serialize on the target row; revalidate eligibility at
        // commit time against a concurrent Administrator deactivate/demote.
        const target = await lockUserRowForUpdate(tx, ownerId);
        if (!isOwnerEligible(target)) {
          return { kind: "ineligible" } as const;
        }
        const data: { ticketOwnerId: number; currentStatus?: "OPEN" } = { ticketOwnerId: ownerId };
        const where: Record<string, unknown> = { id, ticketOwnerId: expectedOwnerId };
        if (current.currentStatus === "NEW") {
          // First assignment atomically changes NEW → OPEN (BR-27, BR-69).
          where.currentStatus = "NEW";
          data.currentStatus = "OPEN";
        }
        const updated = await tx.ticket.updateMany({ where: where as never, data });
        if (updated.count === 0) {
          return { kind: "stale" } as const;
        }
        return { kind: "ok" } as const;
      });

      if (outcome.kind === "missing") {
        return sendError(res, 404, "TICKET_NOT_FOUND", "Ticket not found.");
      }
      if (outcome.kind === "invalid-state") {
        return conflict(res, "INVALID_TICKET_STATE", "The ticket is not in a state that allows this operation.");
      }
      if (outcome.kind === "stale") {
        return conflict(res, "TICKET_STATE_CHANGED", "The ticket has changed. Refresh and try again.");
      }
      if (outcome.kind === "ineligible") {
        return conflict(res, "OWNER_NOT_ELIGIBLE", "The selected ticket owner is no longer eligible. Refresh and try again.");
      }
      const ticket = await readMutationTicket(id);
      res.status(200).json(ticket);
    } catch (err) {
      sendError(res, 500, "INTERNAL_ERROR", "An unexpected error occurred. Please try again.");
    }
  }
);

// ---------------------------------------------------------------------------
// Internal Notes (api-spec §12) — Staff/Admin only. Requester is rejected
// with 403 at the role boundary before note content is queried or exposed.
// Notes are append-only, backend-authored/timestamped, trimmed plain text
// (1–2,000 chars). No edit/delete endpoint exists.
// ---------------------------------------------------------------------------
const NOTE_SELECT = {
  id: true,
  author: { select: { id: true, name: true, role: true } },
  content: true,
  createdAt: true,
} as const;

const NOTE_ORDER = [{ createdAt: "asc" }, { id: "asc" }] as const;

staffRouter.get("/tickets/:id/internal-notes", ...STAFF_GUARD, async (req: Request, res: Response) => {
  try {
    const id = parsePositiveInt(req.params.id);
    if (id === null) {
      return invalid(res, { id: "Ticket id must be a positive integer." });
    }
    const ticket = await getPrisma().ticket.findUnique({ where: { id }, select: { id: true } });
    if (!ticket) {
      return sendError(res, 404, "TICKET_NOT_FOUND", "Ticket not found.");
    }
    const notes = await getPrisma().internalNote.findMany({
      where: { ticketId: id },
      orderBy: NOTE_ORDER as never,
      select: NOTE_SELECT,
    });
    res.status(200).json({ data: notes });
  } catch (err) {
    sendError(res, 500, "INTERNAL_ERROR", "An unexpected error occurred. Please try again.");
  }
});

staffRouter.post("/tickets/:id/internal-notes", requireOrigin, ...STAFF_GUARD, async (req: Request, res: Response) => {
  try {
    const id = parsePositiveInt(req.params.id);
    if (id === null) {
      return invalid(res, { id: "Ticket id must be a positive integer." });
    }
    const body = (req.body ?? {}) as Record<string, unknown>;
    for (const k of Object.keys(body)) {
      if (k !== "content") {
        return invalid(res, { [k]: "Unknown parameter." });
      }
    }
    if (!("content" in body)) {
      return invalid(res, { content: "content is required." });
    }
    if (!isInternalNoteValid(body.content)) {
      return invalid(res, { content: "content must be 1-2000 characters after trimming." });
    }
    const me = (req as AuthRequest).user;
    if (!me) {
      sendError(res, 401, "UNAUTHENTICATED", "Authentication required.");
      return;
    }
    const ticket = await getPrisma().ticket.findUnique({ where: { id }, select: { id: true } });
    if (!ticket) {
      return sendError(res, 404, "TICKET_NOT_FOUND", "Ticket not found.");
    }
    const created = await getPrisma().internalNote.create({
      data: {
        ticketId: id,
        authorId: me.id,
        content: normalizeMessageContent(body.content as string),
      },
      select: NOTE_SELECT,
    });
    res.status(201).json(created);
  } catch (err) {
    sendError(res, 500, "INTERNAL_ERROR", "An unexpected error occurred. Please try again.");
  }
});
