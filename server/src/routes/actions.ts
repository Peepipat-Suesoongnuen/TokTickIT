import { Router, type Request, type Response } from "express";
import { v4 as uuid } from "uuid";
import { getPrisma } from "../prisma.js";
import { sendError } from "../lib/errors.js";
import {
  requireActiveUser,
  requireOrigin,
  requirePasswordChanged,
  requireRole,
  requireSession,
  type AuthRequest,
} from "../auth.js";
import { isOwnerEligible, lockUserRowForUpdate } from "../lib/owner-integrity.js";
import { isActionTransitionAllowed } from "../lib/action-lifecycle.js";
import {
  ACTION_DATE_TOLERANCE_HOURS,
  isActionDateInRange,
  isAttachmentNotesValid,
  isDescriptionValid,
  isFollowUpNoteValid,
  isResultValid,
  isUuid,
  normalizeCreateIntent,
} from "../lib/action-validation.js";
import { trimValue } from "../lib/validation.js";

// ---------------------------------------------------------------------------
// Lab 4 (Issue #77) — Actions Taken routes (api-spec LAP4-01–LAP4-04, LAP4-08).
// Mounted at /api in app.ts. Guards mirror the existing Lab 3 chains:
// session → active user → password gate → role. Every mutation additionally
// requires exact Origin. Server revalidates everything; the client is guidance.
// ---------------------------------------------------------------------------

const STAFF_ACTION_GUARD = [
  requireSession,
  requireActiveUser,
  requirePasswordChanged,
  requireRole("IT_STAFF", "ADMINISTRATOR"),
];

const REQUESTER_READ_GUARD = [
  requireSession,
  requireActiveUser,
  requirePasswordChanged,
];

const TERMINAL_TICKET_STATUSES = new Set(["RESOLVED", "CLOSED", "CANCELLED"]);
const ACTION_STATUSES = new Set(["PLANNED", "IN_PROGRESS", "COMPLETED", "CANCELLED"]);

function invalid(res: Response, fieldErrors: Record<string, string>): void {
  sendError(res, 400, "VALIDATION_FAILED", "One or more fields are invalid.", fieldErrors);
}

function internalError(res: Response): void {
  sendError(res, 500, "INTERNAL_ERROR", "An unexpected error occurred. Please try again.");
}

function parsePositiveInt(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) return value;
  if (typeof value === "string" && /^\d+$/.test(value)) {
    const n = Number(value);
    if (Number.isSafeInteger(n) && n > 0) return n;
  }
  return null;
}

function strictBody(body: unknown, allowed: ReadonlySet<string>): Record<string, string> | null {
  if (body == null || typeof body !== "object" || Array.isArray(body)) {
    return { body: "Request body must be a JSON object." };
  }
  const errors: Record<string, string> = {};
  for (const key of Object.keys(body as Record<string, unknown>)) {
    if (!allowed.has(key)) errors[key] = "Unknown field.";
  }
  return Object.keys(errors).length > 0 ? errors : null;
}

interface ActionRow {
  id: number;
  ticketId: number;
  description: string;
  result: string | null;
  performedById: number;
  assignedToId: number | null;
  actionDate: Date;
  followUpRequired: boolean;
  followUpNote: string | null;
  attachmentNotes: string | null;
  status: string;
  cycle: number;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  performedBy: { id: number; name: string };
  assignedTo: { id: number; name: string } | null;
}

function toActionShape(a: ActionRow) {
  return {
    id: a.id,
    ticketId: a.ticketId,
    description: a.description,
    result: a.result,
    performedBy: a.performedBy,
    assignedTo: a.assignedTo,
    actionDate: a.actionDate.toISOString(),
    followUpRequired: a.followUpRequired,
    followUpNote: a.followUpNote,
    attachmentNotes: a.attachmentNotes,
    status: a.status,
    cycle: a.cycle,
    version: a.version,
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
  };
}

async function lockTicketRow(tx: {
  $queryRaw: (q: TemplateStringsArray, ...v: unknown[]) => Promise<unknown>;
}, ticketId: number) {
  const rows = (await tx.$queryRaw`
    SELECT "id", "currentStatus", "resolutionCycle", "ticketDate"
    FROM "Ticket" WHERE "id" = ${ticketId} FOR UPDATE`) as {
    id: number;
    currentStatus: string;
    resolutionCycle: number;
    ticketDate: Date;
  }[];
  return rows.length > 0 ? rows[0] : null;
}

async function appendEvent(
  tx: {
    actionTakenEvent: {
      create: (args: { data: Record<string, unknown> }) => Promise<unknown>;
    };
  },
  data: {
    actionTakenId: number;
    eventType: string;
    actorId: number;
    payload: Record<string, unknown>;
    requestId: string;
  },
) {
  await tx.actionTakenEvent.create({ data });
}

function validateCommonFields(body: Record<string, unknown>, ticketDate: Date, now: Date) {
  const errors: Record<string, string> = {};
  if (body.description !== undefined && !isDescriptionValid(body.description)) {
    errors.description = "Description must be 1–1000 characters after trimming.";
  }
  if (body.result !== undefined && !isResultValid(body.result)) {
    errors.result = "Result must be 0–2000 characters.";
  }
  if (body.followUpRequired !== undefined && typeof body.followUpRequired !== "boolean") {
    errors.followUpRequired = "followUpRequired must be a boolean.";
  }
  const followUpRequired = body.followUpRequired as boolean | undefined;
  if (body.followUpNote !== undefined && body.followUpNote !== null) {
    if (!isFollowUpNoteValid(followUpRequired === true, body.followUpNote)) {
      errors.followUpNote = followUpRequired === true
        ? "Follow-up note (1–500 characters) is required when follow-up is required."
        : "Follow-up note must be 0–500 characters.";
    }
  } else if (followUpRequired === true) {
    errors.followUpNote = "Follow-up note (1–500 characters) is required when follow-up is required.";
  }
  if (body.attachmentNotes !== undefined && !isAttachmentNotesValid(body.attachmentNotes)) {
    errors.attachmentNotes = "Attachment notes must be 0–500 characters.";
  }
  if (body.actionDate !== undefined) {
    const d = body.actionDate instanceof Date ? body.actionDate : new Date(body.actionDate as string);
    if (!(d instanceof Date) || Number.isNaN(d.getTime())) {
      errors.actionDate = "Action date must be a valid ISO 8601 datetime.";
    } else if (!isActionDateInRange(d, ticketDate, now)) {
      errors.__dateOutOfRange = "true";
    }
  }
  void now;
  return errors;
}

// Emits the contract-specific date-range code instead of the generic
// VALIDATION_FAILED envelope (api-spec validation table, ui-spec §7).
function isDateRangeError(fieldErrors: Record<string, string>): boolean {
  return fieldErrors.__dateOutOfRange === "true";
}

function withoutDateMarker(fieldErrors: Record<string, string>): Record<string, string> {
  const { __dateOutOfRange: _ignored, ...rest } = fieldErrors;
  return { ...rest, actionDate: "Action date must be within [ticket date, now + 1h]." };
}

export const actionsRouter = Router();

// ---------------------------------------------------------------------------
// GET /api/tickets/:id/actions — LAP4-01 (Requester owned-only, Staff visible)
// ---------------------------------------------------------------------------
actionsRouter.get("/tickets/:id/actions", ...REQUESTER_READ_GUARD, async (req: Request, res: Response) => {
  try {
    const ticketId = parsePositiveInt(req.params.id);
    if (ticketId == null) {
      sendError(res, 404, "TICKET_NOT_FOUND", "Ticket not found.");
      return;
    }
    // Strict query contract (Lab 3 §1.6): this endpoint takes no query
    // parameters — unknown or duplicate keys fail closed.
    const queryKeys = Object.keys(req.query);
    if (queryKeys.length > 0) {
      const fieldErrors: Record<string, string> = {};
      for (const k of queryKeys) fieldErrors[k] = "Unknown query parameter.";
      invalid(res, fieldErrors);
      return;
    }
    const auth = (req as AuthRequest).user;
    if (!auth) {
      sendError(res, 401, "UNAUTHENTICATED", "Authentication required.");
      return;
    }
    const prisma = getPrisma();
    const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
    if (!ticket) {
      sendError(res, 404, "TICKET_NOT_FOUND", "Ticket not found.");
      return;
    }
    if (auth.role === "REQUESTER") {
      if (ticket.requesterId !== auth.id) {
        sendError(res, 404, "TICKET_NOT_FOUND", "Ticket not found.");
        return;
      }
    } else if (auth.role !== "IT_STAFF" && auth.role !== "ADMINISTRATOR") {
      sendError(res, 403, "FORBIDDEN", "You do not have permission to access this function.");
      return;
    }
    const actions = (await prisma.actionTaken.findMany({
      where: { ticketId },
      orderBy: [{ actionDate: "asc" }, { id: "asc" }],
      include: {
        performedBy: { select: { id: true, name: true } },
        assignedTo: { select: { id: true, name: true } },
      },
    })) as unknown as ActionRow[];
    res.status(200).json({ actions: actions.map(toActionShape), meta: { count: actions.length } });
  } catch {
    internalError(res);
  }
});

// ---------------------------------------------------------------------------
// GET history — LAP4-08 (staff path + requester owned-only path)
// ---------------------------------------------------------------------------
async function handleListEvents(req: Request, res: Response, requesterOnly: boolean) {
  try {
    const ticketId = parsePositiveInt(req.params.id);
    const actionId = requesterOnly
      ? parsePositiveInt(req.params.actionId)
      : parsePositiveInt(req.params.id);
    void ticketId;
    if (actionId == null) {
      sendError(res, 404, "ACTION_NOT_FOUND", "Action not found.");
      return;
    }
    const auth = (req as AuthRequest).user;
    if (!auth) {
      sendError(res, 401, "UNAUTHENTICATED", "Authentication required.");
      return;
    }
    const prisma = getPrisma();
    const action = await prisma.actionTaken.findUnique({ where: { id: actionId } });
    if (!action) {
      sendError(res, 404, "ACTION_NOT_FOUND", "Action not found.");
      return;
    }
    const ticket = await prisma.ticket.findUnique({ where: { id: action.ticketId } });
    if (!ticket) {
      sendError(res, 404, "ACTION_NOT_FOUND", "Action not found.");
      return;
    }
    if (requesterOnly) {
      if (auth.role !== "REQUESTER" || ticket.requesterId !== auth.id) {
        sendError(res, 404, "ACTION_NOT_FOUND", "Action not found.");
        return;
      }
      if (ticket.id !== ticketId) {
        sendError(res, 404, "ACTION_NOT_FOUND", "Action not found.");
        return;
      }
    } else if (auth.role !== "IT_STAFF" && auth.role !== "ADMINISTRATOR") {
      sendError(res, 403, "FORBIDDEN", "You do not have permission to access this function.");
      return;
    }
    const events = await prisma.actionTakenEvent.findMany({
      where: { actionTakenId: action.id },
      orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
      include: { actor: { select: { id: true, name: true } } },
    });
    res.status(200).json({
      events: events.map((e) => ({
        id: e.id,
        actionTakenId: e.actionTakenId,
        eventType: e.eventType,
        actor: e.actor,
        occurredAt: e.occurredAt.toISOString(),
        payload: e.payload,
        requestId: e.requestId,
      })),
      meta: { count: events.length },
    });
  } catch {
    internalError(res);
  }
}

actionsRouter.get(
  "/staff/actions/:id/events",
  ...STAFF_ACTION_GUARD,
  async (req: Request, res: Response) => handleListEvents(req, res, false),
);

actionsRouter.get(
  "/tickets/:id/actions/:actionId/events",
  ...REQUESTER_READ_GUARD,
  async (req: Request, res: Response) => handleListEvents(req, res, true),
);

// ---------------------------------------------------------------------------
// POST /api/staff/tickets/:id/actions — LAP4-02 create
// ---------------------------------------------------------------------------
const CREATE_KEYS = new Set([
  "description",
  "result",
  "assignedToId",
  "actionDate",
  "followUpRequired",
  "followUpNote",
  "attachmentNotes",
  "clientRequestId",
]);

actionsRouter.post(
  "/staff/tickets/:id/actions",
  requireOrigin,
  ...STAFF_ACTION_GUARD,
  async (req: Request, res: Response) => {
    try {
      const ticketId = parsePositiveInt(req.params.id);
      if (ticketId == null) {
        sendError(res, 404, "TICKET_NOT_FOUND", "Ticket not found.");
        return;
      }
      const auth = (req as AuthRequest).user;
      if (!auth) {
        sendError(res, 401, "UNAUTHENTICATED", "Authentication required.");
        return;
      }
      const body = req.body as Record<string, unknown>;
      const unknown = strictBody(body, CREATE_KEYS);
      if (unknown) {
        invalid(res, unknown);
        return;
      }
      if (typeof body.description !== "string" || !isDescriptionValid(body.description)) {
        invalid(res, { description: "Description must be 1–1000 characters after trimming." });
        return;
      }
      if (typeof body.clientRequestId !== "string" || !isUuid(body.clientRequestId)) {
        invalid(res, { clientRequestId: "clientRequestId (UUID) is required." });
        return;
      }
      const prisma = getPrisma();
      const now = new Date();
      // Intent comparison uses the single normalizeCreateIntent path for both
      // sides (BR-025): every field including actionDate compares exactly.
      // An auto-now retry carries a fresh instant and therefore diverges
      // from the stored row → 409 with no duplicate ever created.
      // Defined outside the transaction so the P2002 fallback (which must
      // run outside the poisoned transaction) can reuse it.
      const actionDateRaw = body.actionDate === undefined ? now : new Date(body.actionDate as string);
      const intentFields = {
        description: body.description,
        assignedToId: null as number | null,
        followUpRequired: body.followUpRequired === true,
        followUpNote: body.followUpNote ?? null,
        attachmentNotes: body.attachmentNotes ?? null,
        result: body.result ?? null,
      };
      const rowIntentOf = (row: {
        description: string;
        assignedToId: number | null;
        followUpRequired: boolean;
        followUpNote: string | null;
        attachmentNotes: string | null;
        result: string | null;
        actionDate: Date;
      }) =>
        normalizeCreateIntent({
          description: row.description,
          assignedToId: row.assignedToId,
          actionDate: row.actionDate,
          followUpRequired: row.followUpRequired,
          followUpNote: row.followUpNote,
          attachmentNotes: row.attachmentNotes,
          result: row.result,
        });
      const sameIntent = (assignedId: number | null, row: Parameters<typeof rowIntentOf>[0]) =>
        normalizeCreateIntent({ ...intentFields, assignedToId: assignedId, actionDate: actionDateRaw }) === rowIntentOf(row);
      const created = await prisma.$transaction(async (tx) => {
        // Lock order (spec §7.3): User rows before Ticket rows. The assignee
        // row (when present) is locked FIRST so a concurrent Admin
        // deactivate/demote serializes on the same row symmetrically with
        // the admin-side lock; eligibility is read post-lock.
        let assignedToId: number | null = null;
        if (body.assignedToId !== undefined && body.assignedToId !== null) {
          const assigneeId = parsePositiveInt(body.assignedToId);
          if (assigneeId == null) {
            invalid(res, { assignedToId: "Assigned user must be a positive user id." });
            return null;
          }
          const target = await lockUserRowForUpdate(tx as never, assigneeId);
          if (!isOwnerEligible(target)) {
            sendError(res, 409, "ACTION_ASSIGNEE_NOT_ELIGIBLE", "The assignee is not an eligible active Staff member.");
            return null;
          }
          assignedToId = assigneeId;
        }
        const ticket = await lockTicketRow(tx as never, ticketId);
        if (!ticket) {
          sendError(res, 404, "TICKET_NOT_FOUND", "Ticket not found.");
          return null;
        }
        if (TERMINAL_TICKET_STATUSES.has(ticket.currentStatus)) {
          sendError(res, 409, "INVALID_ACTION_TRANSITION", "Actions cannot be created on a resolved, closed, or cancelled Ticket. Reopen it first.");
          return null;
        }
        const fieldErrors = validateCommonFields(body, ticket.ticketDate, now);
        if (body.followUpRequired === true && !isFollowUpNoteValid(true, body.followUpNote)) {
          fieldErrors.followUpNote = "Follow-up note (1–500 characters) is required when follow-up is required.";
        }
        if (isDateRangeError(fieldErrors)) {
          sendError(res, 400, "ACTION_DATE_OUT_OF_RANGE", "Action date must be within [ticket date, now + 1h].", withoutDateMarker(fieldErrors));
          return null;
        }
        if (Object.keys(fieldErrors).length > 0) {
          invalid(res, fieldErrors);
          return null;
        }
        const existing = await tx.actionTaken.findUnique({
          where: { ticketId_clientRequestId: { ticketId, clientRequestId: body.clientRequestId as string } },
          include: {
            performedBy: { select: { id: true, name: true } },
            assignedTo: { select: { id: true, name: true } },
          },
        });
        if (existing) {
          if (!sameIntent(assignedToId, existing as unknown as Parameters<typeof rowIntentOf>[0])) {
            sendError(res, 409, "IDEMPOTENCY_CONFLICT", "This idempotency key was already used with different content.");
            return null;
          }
          res.setHeader("Idempotent-Replayed", "true");
          res.status(200).json(toActionShape(existing as unknown as ActionRow));
          return "replayed" as const;
        }
        const requestId = uuid();
        try {
          const action = await tx.actionTaken.create({
            data: {
              ticketId,
              description: trimValue(body.description as string),
              result: body.result == null ? null : trimValue(body.result as string),
              performedById: auth.id,
              assignedToId,
              actionDate: actionDateRaw,
              followUpRequired: body.followUpRequired === true,
              followUpNote: body.followUpRequired === true ? trimValue(body.followUpNote as string) : body.followUpNote == null ? null : trimValue(body.followUpNote as string),
              attachmentNotes: body.attachmentNotes == null ? null : trimValue(body.attachmentNotes as string),
              status: "PLANNED",
              cycle: ticket.resolutionCycle,
              version: 1,
              clientRequestId: body.clientRequestId as string,
            },
            include: {
              performedBy: { select: { id: true, name: true } },
              assignedTo: { select: { id: true, name: true } },
            },
          });
          await appendEvent(tx as never, {
            actionTakenId: action.id,
            eventType: "CREATED",
            actorId: auth.id,
            payload: { description: (action as { description: string }).description },
            requestId,
          });
          res.status(201).json(toActionShape(action as unknown as ActionRow));
          return "created" as const;
        } catch (e) {
          // A failed statement poisons a Postgres interactive transaction,
          // so the P2002 winner lookup MUST happen outside of it: signal
          // outward and resolve after the transaction scope ends.
          if (typeof e === "object" && e !== null && (e as { code?: string }).code === "P2002") {
            throw { __idempotencyRace: true, ticketId, clientRequestId: body.clientRequestId as string };
          }
          throw e;
        }
      }).catch(async (e) => {
        if (typeof e === "object" && e !== null && (e as { __idempotencyRace?: boolean }).__idempotencyRace === true) {
          const race = e as { ticketId: number; clientRequestId: string };
          const prisma = getPrisma();
          const winner = await prisma.actionTaken.findUnique({
            where: { ticketId_clientRequestId: { ticketId: race.ticketId, clientRequestId: race.clientRequestId } },
            include: {
              performedBy: { select: { id: true, name: true } },
              assignedTo: { select: { id: true, name: true } },
            },
          });
          if (!winner) throw e;
          // Outside-transaction comparison uses the body-parsed assignee id
          // (eligibility was already validated for this key's intent).
          const parsedAssignee =
            body.assignedToId === undefined || body.assignedToId === null
              ? null
              : (parsePositiveInt(body.assignedToId) ?? null);
          if (!sameIntent(parsedAssignee, winner as unknown as Parameters<typeof rowIntentOf>[0])) {
            sendError(res, 409, "IDEMPOTENCY_CONFLICT", "This idempotency key was already used with different content.");
            return null;
          }
          res.setHeader("Idempotent-Replayed", "true");
          res.status(200).json(toActionShape(winner as unknown as ActionRow));
          return "replayed" as const;
        }
        throw e;
      });
      void created;
    } catch {
      if (!res.headersSent) internalError(res);
    }
  },
);

// ---------------------------------------------------------------------------
// PUT /api/staff/actions/:id — LAP4-03 update (fields + PLANNED→IN_PROGRESS)
// ---------------------------------------------------------------------------
const UPDATE_KEYS = new Set([
  "description",
  "result",
  "assignedToId",
  "actionDate",
  "followUpRequired",
  "followUpNote",
  "attachmentNotes",
  "status",
  "expectedVersion",
]);

interface AspectChange {
  type: "STATUS_CHANGED" | "ASSIGNED" | "FOLLOW_UP_CHANGED" | "UPDATED";
  payload: Record<string, unknown>;
}

actionsRouter.put(
  "/staff/actions/:id",
  requireOrigin,
  ...STAFF_ACTION_GUARD,
  async (req: Request, res: Response) => {
    try {
      const actionId = parsePositiveInt(req.params.id);
      if (actionId == null) {
        sendError(res, 404, "ACTION_NOT_FOUND", "Action not found.");
        return;
      }
      const auth = (req as AuthRequest).user;
      if (!auth) {
        sendError(res, 401, "UNAUTHENTICATED", "Authentication required.");
        return;
      }
      const body = req.body as Record<string, unknown>;
      const unknown = strictBody(body, UPDATE_KEYS);
      if (unknown) {
        invalid(res, unknown);
        return;
      }
      if (typeof body.expectedVersion !== "number" || !Number.isInteger(body.expectedVersion)) {
        invalid(res, { expectedVersion: "expectedVersion (integer) is required." });
        return;
      }
      if (body.status !== undefined) {
        if (typeof body.status !== "string" || !ACTION_STATUSES.has(body.status)) {
          invalid(res, { status: "Unknown status value." });
          return;
        }
        if (body.status !== "IN_PROGRESS") {
          sendError(res, 409, "INVALID_ACTION_TRANSITION", "Use the complete/cancel endpoints for terminal transitions.");
          return;
        }
      }
      const prisma = getPrisma();
      const now = new Date();
      const requestId = uuid();
      const result = await prisma.$transaction(async (tx) => {
        const action = await tx.actionTaken.findUnique({ where: { id: actionId } });
        if (!action) {
          sendError(res, 404, "ACTION_NOT_FOUND", "Action not found.");
          return null;
        }
        // Lock order (spec §7.3): User row before Ticket row. Resolve and
        // lock a newly assigned user BEFORE taking the Ticket lock so the
        // order matches the Admin side (set/user locks, never Ticket first).
        let assignedToId: number | null | undefined;
        let assigneeChanged = false;
        if (body.assignedToId !== undefined) {
          if (body.assignedToId === null) {
            assigneeChanged = action.assignedToId !== null;
            assignedToId = null;
          } else {
            const assigneeId = parsePositiveInt(body.assignedToId);
            if (assigneeId == null) {
              invalid(res, { assignedToId: "Assigned user must be a positive user id or null." });
              return null;
            }
            const target = await lockUserRowForUpdate(tx as never, assigneeId);
            if (!isOwnerEligible(target)) {
              sendError(res, 409, "ACTION_ASSIGNEE_NOT_ELIGIBLE", "The assignee is not an eligible active Staff member.");
              return null;
            }
            assigneeChanged = action.assignedToId !== assigneeId;
            assignedToId = assigneeId;
          }
        }
        const ticket = await lockTicketRow(tx as never, action.ticketId);
        if (!ticket) {
          sendError(res, 404, "ACTION_NOT_FOUND", "Action not found.");
          return null;
        }
        if (action.status !== "PLANNED" && action.status !== "IN_PROGRESS") {
          sendError(res, 409, "INVALID_ACTION_TRANSITION", "Only open actions can be edited.");
          return null;
        }
        if (TERMINAL_TICKET_STATUSES.has(ticket.currentStatus)) {
          sendError(res, 409, "INVALID_ACTION_TRANSITION", "Actions on a resolved, closed, or cancelled Ticket are read-only.");
          return null;
        }
        if (body.status === "IN_PROGRESS" && !isActionTransitionAllowed(action.status, "IN_PROGRESS")) {
          sendError(res, 409, "INVALID_ACTION_TRANSITION", "Only PLANNED actions can be started.");
          return null;
        }
        const fieldErrors = validateCommonFields(body, ticket.ticketDate, now);
        if (isDateRangeError(fieldErrors)) {
          sendError(res, 400, "ACTION_DATE_OUT_OF_RANGE", "Action date must be within [ticket date, now + 1h].", withoutDateMarker(fieldErrors));
          return null;
        }
        if (Object.keys(fieldErrors).length > 0) {
          invalid(res, fieldErrors);
          return null;
        }
        const data: Record<string, unknown> = {};
        if (body.description !== undefined) data.description = trimValue(body.description as string);
        if (body.result !== undefined) data.result = body.result == null ? null : trimValue(body.result as string);
        if (assignedToId !== undefined) data.assignedToId = assignedToId;
        if (body.actionDate !== undefined) data.actionDate = new Date(body.actionDate as string);
        if (body.followUpRequired !== undefined) data.followUpRequired = body.followUpRequired === true;
        if (body.followUpNote !== undefined) {
          data.followUpNote = body.followUpNote == null ? null : trimValue(body.followUpNote as string);
        }
        if (body.attachmentNotes !== undefined) {
          data.attachmentNotes = body.attachmentNotes == null ? null : trimValue(body.attachmentNotes as string);
        }
        if (body.status === "IN_PROGRESS") data.status = "IN_PROGRESS";
        if (Object.keys(data).length === 0) {
          invalid(res, { body: "No updatable fields provided." });
          return null;
        }
        // Effective-change detection: compare against current values so a
        // no-op write emits zero events and consumes no version (BR-010).
        const sameDate = (a: Date, b: Date) => a.getTime() === b.getTime();
        const transition = body.status === "IN_PROGRESS";
        const followUpEffectiveChanged =
          (data.followUpRequired ?? action.followUpRequired) !== action.followUpRequired ||
          (data.followUpNote ?? action.followUpNote) !== action.followUpNote;
        const contentChanged =
          (data.description ?? action.description) !== action.description ||
          (data.result ?? action.result) !== action.result ||
          (data.actionDate !== undefined && !sameDate(data.actionDate as Date, action.actionDate)) ||
          (data.attachmentNotes ?? action.attachmentNotes) !== action.attachmentNotes;
        if (!transition && !assigneeChanged && !followUpEffectiveChanged && !contentChanged) {
          if ((body.expectedVersion as number) !== action.version) {
            sendError(res, 409, "ACTION_STATE_CHANGED", "The action changed since you loaded it. Refresh and retry.");
            return null;
          }
          const current = await tx.actionTaken.findUnique({
            where: { id: actionId },
            include: {
              performedBy: { select: { id: true, name: true } },
              assignedTo: { select: { id: true, name: true } },
            },
          });
          res.status(200).json(toActionShape(current as unknown as ActionRow));
          return "ok" as const;
        }
        const updated = await tx.actionTaken.updateMany({
          where: { id: actionId, version: body.expectedVersion as number },
          data: { ...data, version: { increment: 1 } },
        });
        if (updated.count === 0) {
          sendError(res, 409, "ACTION_STATE_CHANGED", "The action changed since you loaded it. Refresh and retry.");
          return null;
        }
        const aspects: AspectChange[] = [];
        if (transition) {
          aspects.push({ type: "STATUS_CHANGED", payload: { from: action.status, to: "IN_PROGRESS" } });
        }
        if (assigneeChanged) {
          aspects.push({ type: "ASSIGNED", payload: { from: action.assignedToId, to: assignedToId ?? null } });
        }
        if (followUpEffectiveChanged) {
          aspects.push({
            type: "FOLLOW_UP_CHANGED",
            payload: {
              followUpRequired: (data.followUpRequired ?? action.followUpRequired) as boolean,
              followUpNote: (data.followUpNote ?? action.followUpNote) as string | null,
            },
          });
        }
        if (contentChanged) {
          const fields = Object.keys(data).filter(
            (k) => k !== "status" && k !== "followUpRequired" && k !== "followUpNote" && (data as Record<string, unknown>)[k] !== (action as unknown as Record<string, unknown>)[k],
          );
          aspects.push({ type: "UPDATED", payload: { fields } });
        }
        for (const aspect of aspects) {
          await appendEvent(tx as never, {
            actionTakenId: actionId,
            eventType: aspect.type,
            actorId: auth.id,
            payload: aspect.payload,
            requestId,
          });
        }
        const fresh = await tx.actionTaken.findUnique({
          where: { id: actionId },
          include: {
            performedBy: { select: { id: true, name: true } },
            assignedTo: { select: { id: true, name: true } },
          },
        });
        res.status(200).json(toActionShape(fresh as unknown as ActionRow));
        return "ok" as const;
      });
      void result;
    } catch {
      if (!res.headersSent) internalError(res);
    }
  },
);

// ---------------------------------------------------------------------------
// POST /api/staff/actions/:id/complete|/cancel — LAP4-04
// ---------------------------------------------------------------------------
const COMPLETE_KEYS = new Set(["expectedVersion", "result", "followUpRequired", "followUpNote"]);
const CANCEL_KEYS = new Set(["expectedVersion"]);

async function handleFinish(req: Request, res: Response, kind: "complete" | "cancel") {
  try {
    const actionId = parsePositiveInt(req.params.id);
    if (actionId == null) {
      sendError(res, 404, "ACTION_NOT_FOUND", "Action not found.");
      return;
    }
    const auth = (req as AuthRequest).user;
    if (!auth) {
      sendError(res, 401, "UNAUTHENTICATED", "Authentication required.");
      return;
    }
    const body = (req.body ?? {}) as Record<string, unknown>;
    const unknown = strictBody(body, kind === "complete" ? COMPLETE_KEYS : CANCEL_KEYS);
    if (unknown) {
      invalid(res, unknown);
      return;
    }
    if (typeof body.expectedVersion !== "number" || !Number.isInteger(body.expectedVersion)) {
      invalid(res, { expectedVersion: "expectedVersion (integer) is required." });
      return;
    }
    const prisma = getPrisma();
    const requestId = uuid();
    const result = await prisma.$transaction(async (tx) => {
      const action = await tx.actionTaken.findUnique({ where: { id: actionId } });
      if (!action) {
        sendError(res, 404, "ACTION_NOT_FOUND", "Action not found.");
        return null;
      }
      // Lock order (spec §7.3): accountable User row before Ticket row.
      const accountableId = action.assignedToId ?? action.performedById;
      const accountable = await lockUserRowForUpdate(tx as never, accountableId);
      const ticket = await lockTicketRow(tx as never, action.ticketId);
      if (!ticket) {
        sendError(res, 404, "ACTION_NOT_FOUND", "Action not found.");
        return null;
      }
      if (TERMINAL_TICKET_STATUSES.has(ticket.currentStatus)) {
        sendError(res, 409, "INVALID_ACTION_TRANSITION", "Actions on a resolved, closed, or cancelled Ticket are read-only.");
        return null;
      }
      if (kind === "complete") {
        const effectiveResult =
          body.result !== undefined ? body.result : action.result;
        if (typeof effectiveResult !== "string" || trimValue(effectiveResult).length === 0 || trimValue(effectiveResult).length > 2000) {
          invalid(res, { result: "A non-empty result (max 2000 characters) is required to complete." });
          return null;
        }
        if (action.status !== "IN_PROGRESS") {
          sendError(res, 409, "INVALID_ACTION_TRANSITION", "Only actions in progress can be completed.");
          return null;
        }
        if (body.followUpRequired !== undefined && typeof body.followUpRequired !== "boolean") {
          invalid(res, { followUpRequired: "followUpRequired must be a boolean." });
          return null;
        }
        const followUpRequired = body.followUpRequired === undefined ? action.followUpRequired : body.followUpRequired === true;
        const followUpNote = body.followUpNote !== undefined ? body.followUpNote : action.followUpNote;
        if (!isFollowUpNoteValid(followUpRequired, followUpNote)) {
          invalid(res, { followUpNote: "Follow-up note (1–500 characters) is required when follow-up is required." });
          return null;
        }
        // Already locked above (spec §7.3 order); re-read not needed.
        if (!isOwnerEligible(accountable)) {
          sendError(res, 409, "ACTION_ASSIGNEE_NOT_ELIGIBLE", "The accountable person is no longer eligible.");
          return null;
        }
        const updated = await tx.actionTaken.updateMany({
          where: { id: actionId, version: body.expectedVersion as number },
          data: {
            result: trimValue(effectiveResult as string),
            followUpRequired,
            followUpNote: followUpNote == null ? null : trimValue(followUpNote as string),
            status: "COMPLETED",
            version: { increment: 1 },
          },
        });
        if (updated.count === 0) {
          sendError(res, 409, "ACTION_STATE_CHANGED", "The action changed since you loaded it. Refresh and retry.");
          return null;
        }
        if (followUpRequired !== action.followUpRequired || (followUpNote ?? null) !== action.followUpNote) {
          await appendEvent(tx as never, {
            actionTakenId: actionId,
            eventType: "FOLLOW_UP_CHANGED",
            actorId: auth.id,
            payload: { followUpRequired, followUpNote: followUpNote ?? null },
            requestId,
          });
        }
        await appendEvent(tx as never, {
          actionTakenId: actionId,
          eventType: "COMPLETED",
          actorId: auth.id,
          payload: { result: trimValue(effectiveResult as string) },
          requestId,
        });
      } else {
        if (action.status !== "PLANNED" && action.status !== "IN_PROGRESS") {
          sendError(res, 409, "INVALID_ACTION_TRANSITION", "Only open actions can be cancelled.");
          return null;
        }
        const updated = await tx.actionTaken.updateMany({
          where: { id: actionId, version: body.expectedVersion as number },
          data: { status: "CANCELLED", version: { increment: 1 } },
        });
        if (updated.count === 0) {
          sendError(res, 409, "ACTION_STATE_CHANGED", "The action changed since you loaded it. Refresh and retry.");
          return null;
        }
        await appendEvent(tx as never, {
          actionTakenId: actionId,
          eventType: "CANCELLED",
          actorId: auth.id,
          payload: { from: action.status },
          requestId,
        });
      }
      const fresh = await tx.actionTaken.findUnique({
        where: { id: actionId },
        include: {
          performedBy: { select: { id: true, name: true } },
          assignedTo: { select: { id: true, name: true } },
        },
      });
      res.status(200).json(toActionShape(fresh as unknown as ActionRow));
      return "ok" as const;
    });
    void result;
  } catch {
    if (!res.headersSent) internalError(res);
  }
}

actionsRouter.post(
  "/staff/actions/:id/complete",
  requireOrigin,
  ...STAFF_ACTION_GUARD,
  async (req: Request, res: Response) => handleFinish(req, res, "complete"),
);

actionsRouter.post(
  "/staff/actions/:id/cancel",
  requireOrigin,
  ...STAFF_ACTION_GUARD,
  async (req: Request, res: Response) => handleFinish(req, res, "cancel"),
);
