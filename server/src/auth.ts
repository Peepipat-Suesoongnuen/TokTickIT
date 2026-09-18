import { createHash } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { getPrisma } from "./prisma.js";
import { isSessionExpired } from "./lib/session.js";
import { sendError } from "./lib/errors.js";

// Auth middleware chain (Issue #45, Lab 3 api-spec §§1.2/1.7–1.9, 2).
//
// Order for protected requests: requireOrigin -> requireSession ->
// requireActiveUser -> requirePasswordChanged. requireOrigin also guards
// unauthenticated state-changing routes (e.g. login) when mounted there.
//
// Nothing here ever logs or returns raw session tokens, token hashes,
// failed-login counters, or lock timestamps (api-spec §1.4).

export const SESSION_COOKIE_NAME = "toktickit_session";

export const DEFAULT_DEV_ORIGINS: readonly string[] = [
  "http://localhost:5173",
  "http://localhost:5174",
];

// Legacy single-origin alias (kept for compat; prefer DEFAULT_DEV_ORIGINS).
export const DEFAULT_DEV_ORIGIN = DEFAULT_DEV_ORIGINS[1];

export const PASSWORD_CHANGE_ALLOWLIST = [
  "/api/auth/me",
  "/api/auth/change-password",
  "/api/auth/logout",
] as const;

export const PASSWORD_CHANGE_REQUIRED_MESSAGE =
  "You must change your password before continuing.";
export const ORIGIN_NOT_ALLOWED_MESSAGE = "Request origin is not allowed.";
export const UNAUTHENTICATED_MESSAGE = "Authentication required.";

export const ORIGIN_NOT_ALLOWED_CODE = "ORIGIN_NOT_ALLOWED";
export const UNAUTHENTICATED_CODE = "UNAUTHENTICATED";
export const PASSWORD_CHANGE_REQUIRED_CODE = "PASSWORD_CHANGE_REQUIRED";

// Parses APP_ORIGINS (comma-separated, trimmed, empties dropped). Falls back
// to the documented local-dev defaults (Vite dev port 5173 + README/e2e port
// 5174) only when APP_ORIGINS is unset; a set but empty value yields [] so
// all state-changing requests are denied.
export function getApprovedOrigins(
  env: Record<string, string | undefined> = process.env
): string[] {
  const raw = env.APP_ORIGINS;
  if (raw === undefined) return [...DEFAULT_DEV_ORIGINS];
  return raw
    .split(",")
    .map((v) => v.trim())
    .filter((v) => v.length > 0);
}

// Exact string match only. undefined/empty/"null" are never allowed.
export function isOriginAllowed(
  origin: string | undefined,
  allowed: string[]
): boolean {
  if (!origin || origin === "null") return false;
  return allowed.includes(origin);
}

export interface SafeUser {
  id: number;
  name: string;
  email: string;
  role: string;
  active: boolean;
  mustChangePassword: boolean;
}

// Strips everything but the api-spec §2 wire fields; maps isActive->active.
export function getSafeUser(user: {
  id: number;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
  mustChangePassword: boolean;
}): SafeUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    active: user.isActive,
    mustChangePassword: user.mustChangePassword,
  };
}

export interface AuthSessionRow {
  id: number;
  userId: number;
  expiresAt: Date;
}

export interface AuthUserRow {
  id: number;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
  mustChangePassword: boolean;
}

export type SessionLoader = (
  tokenHash: string
) => Promise<{ session: AuthSessionRow; user: AuthUserRow } | null>;

export interface AuthMiddlewareDeps {
  loadSession?: SessionLoader;
  getAllowedOrigins?: () => string[];
  now?: () => Date;
}

export interface AuthRequest extends Request {
  session?: AuthSessionRow;
  user?: AuthUserRow;
}

export function parseCookieToken(req: Request): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx < 0) continue;
    if (part.slice(0, idx).trim() === SESSION_COOKIE_NAME) {
      const value = part.slice(idx + 1).trim();
      if (!value) return undefined;
      try {
        return decodeURIComponent(value);
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

// Shared session-cookie attributes so login's `res.cookie` and logout's
// `res.clearCookie` stay in parity (httpOnly, sameSite lax, path, and
// secure-if-https). Clearing variants swap maxAge for expired date / Max-Age 0.
export function isSecureRequest(req: Request): boolean {
  if (req.secure) return true;
  const proto = req.headers["x-forwarded-proto"];
  const value = Array.isArray(proto) ? proto[0] : proto;
  return typeof value === "string" && value.split(",")[0]?.trim().toLowerCase() === "https";
}

export function getSessionCookieOptions(req: Request, maxAgeMs: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    maxAge: maxAgeMs,
    secure: isSecureRequest(req),
  };
}

export function getClearSessionCookieOptions(req: Request) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    maxAge: 0,
    secure: isSecureRequest(req),
  };
}

const defaultLoadSession: SessionLoader = async (tokenHash) => {
  const row = await getPrisma().session.findUnique({
    where: { tokenHash },
    include: { user: true },
  });
  if (!row || !row.user) return null;
  return {
    session: { id: row.id, userId: row.userId, expiresAt: row.expiresAt },
    user: {
      id: row.user.id,
      name: row.user.name,
      email: row.user.email,
      role: row.user.role,
      isActive: row.user.isActive,
      mustChangePassword: row.user.mustChangePassword,
    },
  };
};

// Factory with injectable deps so tests can stub the session/user loader
// (and origins/clock) without a DB. Default instances below are bound to
// the Prisma loader and process env for real route wiring.
export function createAuthMiddleware(deps: AuthMiddlewareDeps = {}) {
  const loadSession = deps.loadSession ?? defaultLoadSession;
  const getAllowedOrigins = deps.getAllowedOrigins ?? (() => getApprovedOrigins());
  const now = deps.now ?? (() => new Date());

  function requireOrigin(req: Request, res: Response, next: NextFunction): void {
    if (req.method === "GET" || req.method === "HEAD") {
      next();
      return;
    }
    const origin = req.headers.origin;
    if (!isOriginAllowed(origin, getAllowedOrigins())) {
      sendError(res, 403, ORIGIN_NOT_ALLOWED_CODE, ORIGIN_NOT_ALLOWED_MESSAGE);
      return;
    }
    next();
  }

  function requireSession(req: Request, res: Response, next: NextFunction): void {
    const token = parseCookieToken(req);
    if (!token) {
      sendError(res, 401, UNAUTHENTICATED_CODE, UNAUTHENTICATED_MESSAGE);
      return;
    }
    loadSession(hashToken(token)).then(
      (result) => {
        if (!result || isSessionExpired(result.session.expiresAt, now())) {
          sendError(res, 401, UNAUTHENTICATED_CODE, UNAUTHENTICATED_MESSAGE);
          return;
        }
        (req as AuthRequest).session = result.session;
        (req as AuthRequest).user = result.user;
        next();
      },
      () => {
        sendError(res, 500, "INTERNAL_ERROR", "An unexpected error occurred. Please try again.");
      }
    );
  }

  function requireActiveUser(req: Request, res: Response, next: NextFunction): void {
    const user = (req as AuthRequest).user;
    if (!user || !user.isActive) {
      sendError(res, 401, UNAUTHENTICATED_CODE, UNAUTHENTICATED_MESSAGE);
      return;
    }
    next();
  }

  function requirePasswordChanged(req: Request, res: Response, next: NextFunction): void {
    const user = (req as AuthRequest).user;
    if (
      user &&
      user.mustChangePassword &&
      !(PASSWORD_CHANGE_ALLOWLIST as readonly string[]).includes(req.path)
    ) {
      sendError(res, 403, PASSWORD_CHANGE_REQUIRED_CODE, PASSWORD_CHANGE_REQUIRED_MESSAGE);
      return;
    }
    next();
  }

  return { requireOrigin, requireSession, requireActiveUser, requirePasswordChanged };
}

const defaultMiddleware = createAuthMiddleware();

export const requireOrigin = defaultMiddleware.requireOrigin;
export const requireSession = defaultMiddleware.requireSession;
export const requireActiveUser = defaultMiddleware.requireActiveUser;
export const requirePasswordChanged = defaultMiddleware.requirePasswordChanged;
