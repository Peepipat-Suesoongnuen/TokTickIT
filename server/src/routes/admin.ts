import { Router, type Request, type Response } from "express";
import { getPrisma } from "../prisma.js";
import { sendError } from "../lib/errors.js";
import { trimValue } from "../lib/validation.js";
import {
  requireActiveUser,
  requireOrigin,
  requirePasswordChanged,
  requireRole,
  requireSession,
  type AuthRequest,
} from "../auth.js";
import { canonicalizeEmail, isEmailValid } from "../lib/identity.js";
import { hashPassword } from "../lib/password-hash.js";
import { validateNewPassword } from "../lib/password-policy.js";
import { OWNER_ELIGIBLE_ROLES, lockActiveAdminsForUpdate, lockUserRowForUpdate } from "../lib/owner-integrity.js";

function parsePositiveInt(raw: string): number | null {
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0 || !Number.isSafeInteger(n)) return null;
  return n;
}

// Issue #50 (Lab 3) — minimalist Administrator User Management
// (api-spec §13). Every route requires ADMINISTRATOR; IT Staff and
// Requester receive 403 FORBIDDEN before any user data is exposed.

export const ADMIN_ROLES = ["ADMINISTRATOR"] as const;

const ADMIN_GUARD = [
  requireSession,
  requireActiveUser,
  requirePasswordChanged,
  requireRole(...ADMIN_ROLES),
];

export const ADMIN_USER_ROLES = new Set(["REQUESTER", "IT_STAFF", "ADMINISTRATOR"]);

export function invalid(res: Response, fieldErrors: Record<string, string>): void {
  sendError(res, 400, "VALIDATION_FAILED", "One or more fields are invalid.", fieldErrors);
}

// Safe management row (api-spec §13.1): no password, session, counter,
// lock, or secret metadata ever leaves the API.
export const ADMIN_USER_SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
  isActive: true,
  mustChangePassword: true,
  createdAt: true,
} as const;

export interface AdminUserRow {
  id: number;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
  mustChangePassword: boolean;
  createdAt: Date;
}

export function toAdminUserRow(u: AdminUserRow): Record<string, unknown> {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    active: u.isActive,
    mustChangePassword: u.mustChangePassword,
    createdAt: u.createdAt,
  };
}

export const adminRouter = Router();

// ---------------------------------------------------------------------------
// GET /api/admin/users — list with name/email search + optional role filter
// (api-spec §13.1). Status is returned per row but is NOT a list filter.
// ---------------------------------------------------------------------------
adminRouter.get("/users", ...ADMIN_GUARD, async (req: Request, res: Response) => {
  try {
    const allowed = new Set(["search", "role"]);
    for (const k of Object.keys(req.query)) {
      if (!allowed.has(k)) {
        return invalid(res, { [k]: "Unknown parameter." });
      }
    }
    for (const p of allowed) {
      const v = (req.query as Record<string, unknown>)[p];
      if (v !== undefined && typeof v !== "string") {
        return invalid(res, { [p]: `${p} must be a single value.` });
      }
    }
    const { search, role } = req.query as Record<string, string | undefined>;

    let searchTrim: string | undefined;
    if (search !== undefined) {
      searchTrim = trimValue(search);
      if (searchTrim.length === 0) {
        return invalid(res, { search: "search must not be empty or whitespace only." });
      }
    }
    if (role !== undefined && !ADMIN_USER_ROLES.has(role)) {
      return invalid(res, { role: "Invalid role." });
    }

    const where: Record<string, unknown> = {};
    if (role !== undefined) where.role = role;
    if (searchTrim !== undefined) {
      where.OR = [
        { name: { contains: searchTrim, mode: "insensitive" } },
        { email: { contains: searchTrim, mode: "insensitive" } },
      ];
    }
    const users = await getPrisma().user.findMany({
      where: where as never,
      orderBy: [{ name: "asc" }, { id: "asc" }],
      select: ADMIN_USER_SELECT,
    });
    res.status(200).json({ data: users.map(toAdminUserRow) });
  } catch (err) {
    sendError(res, 500, "INTERNAL_ERROR", "An unexpected error occurred. Please try again.");
  }
});

// ---------------------------------------------------------------------------
// POST /api/admin/users — create one user with one role (api-spec §13.2)
// ---------------------------------------------------------------------------
adminRouter.post("/users", requireOrigin, ...ADMIN_GUARD, async (req: Request, res: Response) => {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const allowed = new Set(["name", "email", "role", "active", "initialPassword"]);
    for (const k of Object.keys(body)) {
      if (!allowed.has(k)) {
        return invalid(res, { [k]: "Unknown parameter." });
      }
    }
    for (const k of ["name", "email", "role", "active", "initialPassword"]) {
      if (!(k in body)) {
        return invalid(res, { [k]: `${k} is required.` });
      }
    }

    if (typeof body.name !== "string" || trimValue(body.name).length < 2 || trimValue(body.name).length > 100) {
      return invalid(res, { name: "name must be 2-100 characters after trimming." });
    }
    if (typeof body.email !== "string") {
      return invalid(res, { email: "email must be a string." });
    }
    const emailTrimmed = trimValue(body.email);
    if (emailTrimmed.length < 3 || emailTrimmed.length > 254 || !isEmailValid(emailTrimmed)) {
      return invalid(res, { email: "email must be a valid address of 3-254 characters." });
    }
    if (typeof body.role !== "string" || !ADMIN_USER_ROLES.has(body.role)) {
      return invalid(res, { role: "role must be one of REQUESTER, IT_STAFF, ADMINISTRATOR." });
    }
    if (typeof body.active !== "boolean") {
      return invalid(res, { active: "active must be a boolean." });
    }
    if (typeof body.initialPassword !== "string" || validateNewPassword(body.initialPassword, "").length > 0) {
      return invalid(res, { initialPassword: "initialPassword does not meet the password policy." });
    }

    const email = canonicalizeEmail(emailTrimmed);
    const existing = await getPrisma().user.findUnique({ where: { email }, select: { id: true } });
    if (existing) {
      return sendError(res, 409, "EMAIL_ALREADY_EXISTS", "A user with this email already exists.");
    }
    try {
      const created = await getPrisma().user.create({
        data: {
          name: trimValue(body.name as string),
          email,
          passwordHash: await hashPassword(body.initialPassword as string),
          role: body.role as "REQUESTER" | "IT_STAFF" | "ADMINISTRATOR",
          isActive: body.active as boolean,
          mustChangePassword: true,
          failedLoginAttempts: 0,
        },
        select: ADMIN_USER_SELECT,
      });
      res.status(201).json(toAdminUserRow(created));
    } catch (err) {
      // Case-variant race between the check and the insert.
      if (err instanceof Error && (err as unknown as { code?: string }).code === "P2002") {
        return sendError(res, 409, "EMAIL_ALREADY_EXISTS", "A user with this email already exists.");
      }
      throw err;
    }
  } catch (err) {
    sendError(res, 500, "INTERNAL_ERROR", "An unexpected error occurred. Please try again.");
  }
});

// ---------------------------------------------------------------------------
// PATCH /api/admin/users/:id — partial update with atomic full-state safety
// (api-spec §13.3, BR-42/43/45/47, BR-76 admin side)
// ---------------------------------------------------------------------------
adminRouter.patch(
  "/users/:id",
  requireOrigin,
  ...ADMIN_GUARD,
  async (req: Request, res: Response) => {
    try {
      const id = parsePositiveInt(req.params.id);
      if (id === null) {
        return invalid(res, { id: "User id must be a positive integer." });
      }
      const body = (req.body ?? {}) as Record<string, unknown>;
      const allowed = new Set(["name", "email", "role", "active"]);
      for (const k of Object.keys(body)) {
        if (!allowed.has(k)) {
          return invalid(res, { [k]: "Unknown parameter." });
        }
      }
      if (Object.keys(body).length === 0) {
        return invalid(res, { active: "At least one updatable field is required." });
      }

      if ("name" in body) {
        if (typeof body.name !== "string" || trimValue(body.name).length < 2 || trimValue(body.name).length > 100) {
          return invalid(res, { name: "name must be 2-100 characters after trimming." });
        }
      }
      let canonicalEmail: string | undefined;
      if ("email" in body) {
        if (typeof body.email !== "string") {
          return invalid(res, { email: "email must be a string." });
        }
        const trimmed = trimValue(body.email);
        if (trimmed.length < 3 || trimmed.length > 254 || !isEmailValid(trimmed)) {
          return invalid(res, { email: "email must be a valid address of 3-254 characters." });
        }
        canonicalEmail = canonicalizeEmail(trimmed);
      }
      if ("role" in body && (typeof body.role !== "string" || !ADMIN_USER_ROLES.has(body.role))) {
        return invalid(res, { role: "role must be one of REQUESTER, IT_STAFF, ADMINISTRATOR." });
      }
      if ("active" in body && typeof body.active !== "boolean") {
        return invalid(res, { active: "active must be a boolean." });
      }

      const me = (req as AuthRequest).user;
      if (!me) {
        sendError(res, 401, "UNAUTHENTICATED", "Authentication required.");
        return;
      }

      const outcome = await getPrisma().$transaction(async (tx) => {
        // Global lock order for every admin update (deadlock-free by
        // construction): the active-admin set first in ascending id
        // order, then at most one target row below. Staff-side paths
        // lock single user rows only and never take set locks, so no
        // lock cycle can form with them either.
        const lockedActive = await lockActiveAdminsForUpdate(tx);

        const target = await tx.user.findUnique({ where: { id } });
        if (!target) return { kind: "missing" } as const;

        const nextActive = ("active" in body ? body.active : target.isActive) as boolean;
        const nextRole = (("role" in body ? body.role : target.role) as string);
        const nextName = ("name" in body ? trimValue(body.name as string) : target.name);
        const nextEmail = canonicalEmail ?? target.email;

        // Canonical-email collision (BR-40), checked inside the transaction
        // so a concurrent create cannot slip between check and write.
        if (nextEmail !== target.email) {
          const clash = await tx.user.findUnique({ where: { email: nextEmail }, select: { id: true } });
          if (clash && clash.id !== id) {
            return { kind: "email-taken" } as const;
          }
        }

        // BR-42: self-deactivation is rejected before any other evaluation.
        if (id === me.id && nextActive === false) {
          return { kind: "self" } as const;
        }

        const eligibilityChanging =
          nextActive === false || !OWNER_ELIGIBLE_ROLES.has(nextRole);
        const wasEligible = target.isActive && OWNER_ELIGIBLE_ROLES.has(target.role);

        if (eligibilityChanging && wasEligible) {
          // BR-76 admin side: the target row is already covered when it is
          // an admin (set lock above); non-admin targets take their single
          // row lock here — after the set, preserving global order.
          if (!lockedActive.includes(id)) {
            const locked = await lockUserRowForUpdate(tx, id);
            if (!locked) return { kind: "missing" } as const;
          }
          const openTickets = await tx.ticket.count({
            where: {
              ticketOwnerId: id,
              currentStatus: { notIn: ["CLOSED", "CANCELLED"] },
            },
          });
          if (openTickets > 0) {
            return { kind: "has-tickets" } as const;
          }
        }

        // BR-43: the last active Administrator invariant. The locked set
        // is post-commit truth: only the admins still active besides this
        // target may remain after our change.
        if (target.role === "ADMINISTRATOR" && target.isActive && (nextActive === false || nextRole !== "ADMINISTRATOR")) {
          const othersActive = lockedActive.filter((aid) => aid !== id);
          if (othersActive.length === 0) {
            return { kind: "last-admin" } as const;
          }
        }

        // BR-47: all-or-nothing — a single update of the complete state.
        const updated = await tx.user.update({
          where: { id },
          data: { name: nextName, email: nextEmail, role: nextRole as never, isActive: nextActive },
          select: ADMIN_USER_SELECT,
        });
        return { kind: "ok", user: updated } as const;
      });

      if (outcome.kind === "missing") {
        return sendError(res, 404, "USER_NOT_FOUND", "User not found.");
      }
      if (outcome.kind === "email-taken") {
        return sendError(res, 409, "EMAIL_ALREADY_EXISTS", "A user with this email already exists.");
      }
      if (outcome.kind === "self") {
        return sendError(res, 409, "CANNOT_DEACTIVATE_SELF", "You cannot deactivate your own account.");
      }
      if (outcome.kind === "has-tickets") {
        return sendError(res, 409, "USER_HAS_ACTIVE_TICKETS", "Reassign this user's active tickets before changing the role or deactivating the account.");
      }
      if (outcome.kind === "last-admin") {
        return sendError(res, 409, "LAST_ACTIVE_ADMINISTRATOR", "At least one active Administrator must remain.");
      }
      res.status(200).json(toAdminUserRow(outcome.user));
    } catch (err) {
      if (err instanceof Error && (err as unknown as { code?: string }).code === "P2002") {
        return sendError(res, 409, "EMAIL_ALREADY_EXISTS", "A user with this email already exists.");
      }
      sendError(res, 500, "INTERNAL_ERROR", "An unexpected error occurred. Please try again.");
    }
  }
);

// ---------------------------------------------------------------------------
// POST /api/admin/users/:id/initial-password — atomic reset (api-spec
// §13.4, BR-44/62): policy hash + mandatory flag + lock reset + full
// session invalidation together. Success is 204 with no secret echo. This
// is not a standalone unlock: lock clearing is part of the reset.
// ---------------------------------------------------------------------------
adminRouter.post(
  "/users/:id/initial-password",
  requireOrigin,
  ...ADMIN_GUARD,
  async (req: Request, res: Response) => {
    try {
      const id = parsePositiveInt(req.params.id);
      if (id === null) {
        return invalid(res, { id: "User id must be a positive integer." });
      }
      const body = (req.body ?? {}) as Record<string, unknown>;
      for (const k of Object.keys(body)) {
        if (k !== "initialPassword") {
          return invalid(res, { [k]: "Unknown parameter." });
        }
      }
      if (!("initialPassword" in body)) {
        return invalid(res, { initialPassword: "initialPassword is required." });
      }
      if (typeof body.initialPassword !== "string" || validateNewPassword(body.initialPassword, "").length > 0) {
        return invalid(res, { initialPassword: "initialPassword does not meet the password policy." });
      }

      const outcome = await getPrisma().$transaction(async (tx) => {
        const target = await tx.user.findUnique({ where: { id }, select: { id: true } });
        if (!target) return { kind: "missing" } as const;
        await tx.user.update({
          where: { id },
          data: {
            passwordHash: await hashPassword(body.initialPassword as string),
            mustChangePassword: true,
            failedLoginAttempts: 0,
            lockedUntil: null,
          },
        });
        await tx.session.deleteMany({ where: { userId: id } });
        return { kind: "ok" } as const;
      });

      if (outcome.kind === "missing") {
        return sendError(res, 404, "USER_NOT_FOUND", "User not found.");
      }
      res.status(204).send();
    } catch (err) {
      sendError(res, 500, "INTERNAL_ERROR", "An unexpected error occurred. Please try again.");
    }
  }
);

export default adminRouter;
