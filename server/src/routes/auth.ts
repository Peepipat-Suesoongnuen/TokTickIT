import { Router, type Request, type Response } from "express";
import { getPrisma } from "../prisma.js";
import { sendError } from "../lib/errors.js";
import {
  getApprovedOrigins,
  getSafeUser,
  isOriginAllowed,
  ORIGIN_NOT_ALLOWED_CODE,
  ORIGIN_NOT_ALLOWED_MESSAGE,
  SESSION_COOKIE_NAME,
} from "../auth.js";
import { canonicalizeEmail } from "../lib/identity.js";
import { verifyPassword } from "../lib/password-hash.js";
import { createSessionToken } from "../lib/session.js";
import {
  buildFailedLoginUpdate,
  getLoginRateLimiter,
  isAccountLocked,
  type LoginRateLimiter,
} from "../lib/login-protection.js";

// POST /api/auth/login (Issue #45, Lab 3 api-spec §3.1).
//
// Order: Origin gate -> IP limiter -> strict body validation -> generic
// credential check. Origin is enforced before any credential processing
// (api-spec §1.9); all account-specific failures share one generic 401 so
// unknown email / wrong password / inactive user / locked account are
// indistinguishable. mustChangePassword passes through — gating is the auth
// middleware's business, not login's.
//
// Nothing here logs or returns passwords, hashes, tokens, counters, or lock
// state (api-spec §1.4).

export const INVALID_CREDENTIALS_CODE = "INVALID_CREDENTIALS";
export const INVALID_CREDENTIALS_MESSAGE = "Invalid email or password.";
export const TOO_MANY_ATTEMPTS_CODE = "TOO_MANY_ATTEMPTS";
export const TOO_MANY_ATTEMPTS_MESSAGE =
  "Too many login attempts. Please try again later.";

const VALIDATION_MESSAGE = "One or more fields are invalid.";

// Absolute 8h session lifetime (api-spec §§1.2, 3.1): no sliding extension.
export const LOGIN_SESSION_TTL_MS = 8 * 3600 * 1000;

export interface AuthRouterDeps {
  now?: () => Date;
  limiter?: LoginRateLimiter;
  getAllowedOrigins?: () => string[];
}

function invalidCredentials(res: Response): void {
  sendError(res, 401, INVALID_CREDENTIALS_CODE, INVALID_CREDENTIALS_MESSAGE);
}

export function createAuthRouter(deps: AuthRouterDeps = {}): Router {
  const now = deps.now ?? (() => new Date());
  const limiter = deps.limiter ?? getLoginRateLimiter();
  const getAllowedOrigins = deps.getAllowedOrigins ?? (() => getApprovedOrigins());

  const router = Router();

  router.post("/login", async (req: Request, res: Response) => {
    try {
      // 1. Origin gate first: rejected origins see neither the limiter nor
      // any credential processing, and never touch failed-attempt state.
      const origin = req.headers.origin;
      if (!isOriginAllowed(origin, getAllowedOrigins())) {
        sendError(res, 403, ORIGIN_NOT_ALLOWED_CODE, ORIGIN_NOT_ALLOWED_MESSAGE);
        return;
      }

      // 2. IP limiter (sliding window over failed attempts). When the IP is
      // missing, skip limiter checking AND recording for this request
      // (fail open per-request): collapsing all unknown-IP requests into a
      // single "unknown" bucket would let one client throttle unrelated
      // clients, so missing-IP requests never touch limiter state.
      const ip: string | undefined = req.ip;
      if (ip !== undefined && limiter.isLimited(ip)) {
        sendError(res, 429, TOO_MANY_ATTEMPTS_CODE, TOO_MANY_ATTEMPTS_MESSAGE);
        return;
      }

      // 3. Strict contract (§1.6): exactly { email, password }; unknown
      // fields rejected like unknown query params on existing routes.
      const body = (req.body ?? {}) as Record<string, unknown>;
      const allowed = new Set(["email", "password"]);
      for (const key of Object.keys(body)) {
        if (!allowed.has(key)) {
          sendError(res, 400, "VALIDATION_FAILED", VALIDATION_MESSAGE, {
            [key]: "Unknown parameter.",
          });
          return;
        }
      }
      const { email, password } = body;
      const fieldErrors: Record<string, string> = {};
      if (typeof email !== "string" || email.trim().length === 0) {
        fieldErrors.email = "Email is required.";
      }
      if (typeof password !== "string" || password.length === 0) {
        fieldErrors.password = "Password is required.";
      }
      if (Object.keys(fieldErrors).length > 0) {
        sendError(res, 400, "VALIDATION_FAILED", VALIDATION_MESSAGE, fieldErrors);
        return;
      }

      const canonical = canonicalizeEmail(email as string);
      const user = await getPrisma().user.findUnique({ where: { email: canonical } });

      if (!user || !user.isActive) {
        if (ip !== undefined) limiter.record(ip);
        invalidCredentials(res);
        return;
      }

      // Correct password while locked still fails generically; the lock is
      // left untouched (no extension, no disclosure).
      if (isAccountLocked(user.lockedUntil, now())) {
        if (ip !== undefined) limiter.record(ip);
        invalidCredentials(res);
        return;
      }

      const ok = await verifyPassword(user.passwordHash, password as string);
      if (!ok) {
        // ONE atomic update: counter increment (+ lock timestamp exactly at
        // the 5th consecutive failure). No read-then-write.
        await getPrisma().user.update({
          where: { id: user.id },
          data: buildFailedLoginUpdate(user.failedLoginAttempts, now()),
        });
        if (ip !== undefined) limiter.record(ip);
        invalidCredentials(res);
        return;
      }

      // Success: fresh 8h session + reset of failed-attempt state together.
      const { token, tokenHash } = createSessionToken();
      const current = now();
      const expiresAt = new Date(current.getTime() + LOGIN_SESSION_TTL_MS);
      const [updated] = await getPrisma().$transaction([
        getPrisma().user.update({
          where: { id: user.id },
          data: { failedLoginAttempts: 0, lockedUntil: null },
        }),
        getPrisma().session.create({
          data: { userId: user.id, tokenHash, expiresAt },
        }),
      ]);

      res.cookie(SESSION_COOKIE_NAME, token, {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        maxAge: LOGIN_SESSION_TTL_MS,
      });
      res.status(200).json({ user: getSafeUser(updated) });
    } catch {
      sendError(res, 500, "INTERNAL_ERROR", "An unexpected error occurred. Please try again.");
    }
  });

  return router;
}

const authRouter = createAuthRouter();

export default authRouter;
