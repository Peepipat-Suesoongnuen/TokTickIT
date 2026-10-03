import { Router, type Request, type Response } from "express";
import { getPrisma } from "../prisma.js";
import { sendError } from "../lib/errors.js";
import {
  requireActiveUser,
  requirePasswordChanged,
  requireRole,
  requireSession,
  type AuthRequest,
} from "../auth.js";
import {
  NON_TERMINAL_TICKET_STATUSES,
  compareUrgentDesc,
  openAssignedActionSome,
  windowBounds,
} from "../lib/dashboard-metrics.js";

// Issue #80 (Lab 4) — Role dashboards (LAP4-06/07).
//
// Backend-calculated only: every number below comes from request-time DB
// reads scoped to the caller. The client MUST NOT aggregate or recompute.
// The 30-day completion window derives from ONE server-captured `now` per
// request, passed down as values (never per-row DB now()).

export const dashboardRouter = Router();

const REQUESTER_GUARD = [requireSession, requireActiveUser, requirePasswordChanged, requireRole("REQUESTER")];
const STAFF_GUARD = [requireSession, requireActiveUser, requirePasswordChanged, requireRole("IT_STAFF", "ADMINISTRATOR")];

const OPEN_STATUSES: ("NEW" | "OPEN" | "IN_PROGRESS" | "WAITING_FOR_REQUESTER" | "REOPENED")[] = [
  ...NON_TERMINAL_TICKET_STATUSES,
] as ("NEW" | "OPEN" | "IN_PROGRESS" | "WAITING_FOR_REQUESTER" | "REOPENED")[];

function ticketRowSelect() {
  return {
    id: true,
    ticketNumber: true,
    summary: true,
    currentStatus: true,
    updatedAt: true,
  } as const;
}

// Shared EXISTS predicate for "tickets holding >=1 open action assigned to
// a user" (BR-018). Used by assignedToMe AND the ?assignee= queue filter so
// the metric and its drill-down destination are dataset-identical by
// construction (C-80-08).
export function openAssignedTicketFilter(assigneeId: number) {
  return {
    currentStatus: { in: OPEN_STATUSES },
    actions: { some: { assignedToId: assigneeId, status: { in: ["PLANNED", "IN_PROGRESS"] } } },
  };
}

// ---------------------------------------------------------------------------
// GET /api/dashboard/requester (LAP4-06)
// ---------------------------------------------------------------------------
dashboardRouter.get("/requester", ...REQUESTER_GUARD, async (req: Request, res: Response) => {
  try {
    const auth = (req as AuthRequest).user;
    if (!auth) {
      sendError(res, 401, "UNAUTHENTICATED", "Authentication required.");
      return;
    }
    const owned = { requesterId: auth.id };
    const [openTickets, waitingForRequester, resolvedCount] = await Promise.all([
      getPrisma().ticket.count({ where: { ...owned, currentStatus: { in: OPEN_STATUSES } } }),
      getPrisma().ticket.count({ where: { ...owned, currentStatus: "WAITING_FOR_REQUESTER" } }),
      // Reviewer finding 1 (FIX-REVIEW PR #86): authoritative full-dataset
      // count of owned RESOLVED/CLOSED tickets. The recentlyResolved list
      // below is a bounded top-5 view of this same dataset; the card value
      // MUST come from this count, never from the list length.
      getPrisma().ticket.count({ where: { ...owned, currentStatus: { in: ["RESOLVED", "CLOSED"] } } }),
    ]);
    const [recentlyUpdated, recentlyResolved] = await Promise.all([
      getPrisma().ticket.findMany({
        where: { ...owned, currentStatus: { in: OPEN_STATUSES } },
        select: ticketRowSelect(),
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        take: 5,
      }),
      getPrisma().ticket.findMany({
        where: { ...owned, currentStatus: { in: ["RESOLVED", "CLOSED"] } },
        select: ticketRowSelect(),
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        take: 5,
      }),
    ]);
    res.status(200).json({
      metrics: { openTickets, waitingForRequester, recentlyResolved: resolvedCount },
      recentlyUpdated,
      recentlyResolved,
      links: {
        openTickets: "/my-tickets?state=open",
        waitingForRequester: "/my-tickets?status=WAITING_FOR_REQUESTER",
        recentlyResolved: "/my-tickets?state=resolved",
      },
    });
  } catch {
    sendError(res, 500, "INTERNAL_ERROR", "An unexpected error occurred. Please try again.");
  }
});

// ---------------------------------------------------------------------------
// GET /api/dashboard/staff (LAP4-07)
// ---------------------------------------------------------------------------
dashboardRouter.get("/staff", ...STAFF_GUARD, async (req: Request, res: Response) => {
  try {
    const auth = (req as AuthRequest).user;
    if (!auth) {
      sendError(res, 401, "UNAUTHENTICATED", "Authentication required.");
      return;
    }
    // Single request-time capture (BR-018): every window/ordering below
    // derives from this one value.
    const now = new Date();
    const { start, end } = windowBounds(now);
    const openWhere = { currentStatus: { in: OPEN_STATUSES } };
    const [ownedByMe, assignedTickets, unassigned, urgentCount, byStatusRows, byItPriorityRows] = await Promise.all([
      getPrisma().ticket.count({ where: { ...openWhere, ticketOwnerId: auth.id } }),
      getPrisma().ticket.findMany({
        where: { ...openWhere, actions: { some: openAssignedActionSome(auth.id) } },
        select: { id: true },
      }),
      getPrisma().ticket.count({ where: { ...openWhere, ticketOwnerId: null } }),
      getPrisma().ticket.count({ where: { ...openWhere, itPriority: { in: ["HIGH", "CRITICAL"] } } }),
      getPrisma().ticket.groupBy({ by: ["currentStatus"] as ["currentStatus"], where: openWhere, _count: { _all: true } }),
      getPrisma().ticket.groupBy({ by: ["itPriority"] as ["itPriority"], where: openWhere, _count: { _all: true } }),
    ]);
    const assignedToMe = assignedTickets.length;
    const completedGroups = await prismaActionGroupsInWindow(auth.id, start, end);
    const recordedByMe = completedGroups.length;
    const [recentRows, urgentRows] = await Promise.all([
      getPrisma().ticket.findMany({
        select: {
          id: true,
          ticketNumber: true,
          summary: true,
          currentStatus: true,
          owner: { select: { id: true, name: true } },
          updatedAt: true,
        },
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        take: 8,
      }),
      getPrisma().ticket.findMany({
        where: { ...openWhere, itPriority: { in: ["HIGH", "CRITICAL"] } },
        select: {
          id: true,
          ticketNumber: true,
          summary: true,
          itPriority: true,
          currentStatus: true,
          updatedAt: true,
        },
      }),
    ]);
    const urgentTickets = [...urgentRows]
      .sort((a, b) =>
        compareUrgentDesc(
          { itPriority: a.itPriority, updatedAt: a.updatedAt, id: a.id },
          { itPriority: b.itPriority, updatedAt: b.updatedAt, id: b.id },
        ),
      )
      .slice(0, 10);
    const byStatus: Record<string, number> = {};
    for (const row of byStatusRows as { currentStatus: string; _count: { _all: number } }[]) {
      byStatus[row.currentStatus] = row._count._all;
    }
    const byItPriority: Record<string, number> = {};
    for (const row of byItPriorityRows as { itPriority: string; _count: { _all: number } }[]) {
      byItPriority[row.itPriority] = row._count._all;
    }
    const body: Record<string, unknown> = {
      metrics: { ownedByMe, assignedToMe, recordedByMe, unassigned, urgentHighPriority: urgentCount, byStatus, byItPriority },
      recentlyUpdated: recentRows,
      urgentTickets,
      links: {
        ownedByMe: "/staff/queue?owner=me&state=open",
        assignedToMe: "/staff/queue?assignee=me&state=open",
        unassigned: "/staff/queue?owner=unassigned&state=open",
        urgentHighPriority: "/staff/queue?itPriority=HIGH,CRITICAL&state=open",
        usersByRole: "/admin/users?role=IT_STAFF",
      },
    };
    if (auth.role === "ADMINISTRATOR") {
      const [total, active, byRoleRows] = await Promise.all([
        getPrisma().user.count(),
        getPrisma().user.count({ where: { isActive: true } }),
        getPrisma().user.groupBy({ by: ["role"] as ["role"], _count: { _all: true } }),
      ]);
      const byRole: Record<string, number> = { REQUESTER: 0, IT_STAFF: 0, ADMINISTRATOR: 0 };
      for (const row of byRoleRows as { role: string; _count: { _all: number } }[]) {
        byRole[row.role] = row._count._all;
      }
      // Deactivated is derived client-side as total - active and is never
      // transmitted; no user objects, emails, or per-account fields (BR-020).
      body.userCounts = { total, active, byRole };
    }
    res.status(200).json(body);
  } catch {
    sendError(res, 500, "INTERNAL_ERROR", "An unexpected error occurred. Please try again.");
  }
});

async function prismaActionGroupsInWindow(recordedById: number, start: Date, end: Date) {
  return getPrisma().actionTakenEvent.groupBy({
    by: ["actionTakenId"] as ["actionTakenId"],
    where: {
      eventType: "COMPLETED",
      occurredAt: { gte: start, lte: end },
      action: { recordedById },
    },
    _count: { _all: true },
  });
}
