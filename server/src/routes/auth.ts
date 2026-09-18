import { Router, type Request, type Response } from "express";
import { getPrisma } from "../prisma.js";
import { sendError } from "../lib/errors.js";
import {
  getApprovedOrigins,
  getClearSessionCookieOptions,
  getSafeUser,
  getSessionCookieOptions,
  hashToken,
  isOriginAllowed,
  ORIGIN_NOT_ALLOWED_CODE,
  ORIGIN_NOT_ALLOWED_MESSAGE,
  parseCookieToken,
  requireActiveUser,
  requireOrigin,
  requireSession,
  SESSION_COOKIE_NAME,
  UNAUTHENTICATED_CODE,
  UNAUTHENTICATED_MESSAGE,
  type AuthRequest,
} from "../auth.js";
import { canonicalizeEmail } from "../lib/identity.js";
import { hashPassword, verifyPassword } from "../lib/password-hash.js";
import { validateNewPassword } from "../lib/password-policy.js";
import { createSessionToken } from "../lib/session.js";
import {
  getLoginRateLimiter,
  isAccountLocked,
  recordFailedLoginAttempt,
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
export const CURRENT_PASSWORD_INVALID_CODE = "CURRENT_PASSWORD_INVALID";
export const CURRENT_PASSWORD_INVALID_MESSAGE = "Current password is incorrect.";

const VALIDATION_MESSAGE = "One or more fields are invalid.";

// Absolute 8h session lifetime (api-spec §§1.2, 3.1): no sliding extension.
export const LOGIN_SESSION_TTL_MS = 8 * 3600 * 1000;

export interface AuthRouterDeps {
  now?: () => Date;
  limiter?: LoginRateLimiter;
  getAllowedOrigins?: () => string[];
  verifyPasswordFn?: (hash: string, plaintext: string) => Promise<boolean>;
}

// NOT a real credential — timing-normalization decoy only; never matches any
// login. Awaited on the unknown-email / inactive-user / locked-account fast
// paths so every 401 pays ~one Argon2 verification, just like the
// wrong-password path, and response timing reveals no account state.
const DUMMY_PASSWORD_HASH =
  "$argon2id$v=19$m=19456,t=2,p=1$pxmBatfJNgok6kBopeiYcw$j3Clc2gSZwPYX/2kJDKagYbH5pXmCztgatdjojVqbfg";

function invalidCredentials(res: Response): void {
  sendError(res, 401, INVALID_CREDENTIALS_CODE, INVALID_CREDENTIALS_MESSAGE);
}

export function createAuthRouter(deps: AuthRouterDeps = {}): Router {
  const now = deps.now ?? (() => new Date());
  const limiter = deps.limiter ?? getLoginRateLimiter();
  const getAllowedOrigins = deps.getAllowedOrigins ?? (() => getApprovedOrigins());
  const verifyFn = deps.verifyPasswordFn ?? verifyPassword;

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
        // Timing normalization: unknown email and inactive user cost one
        // Argon2 verification, like a wrong password (result discarded).
        await verifyFn(DUMMY_PASSWORD_HASH, password as string);
        if (ip !== undefined) limiter.record(ip);
        invalidCredentials(res);
        return;
      }

      // Correct password while locked still fails generically; the lock is
      // left untouched (no extension, no disclosure).
      if (isAccountLocked(user.lockedUntil, now())) {
        // Timing normalization: same decoy verification as above.
        await verifyFn(DUMMY_PASSWORD_HASH, password as string);
        if (ip !== undefined) limiter.record(ip);
        invalidCredentials(res);
        return;
      }

      const ok = await verifyFn(user.passwordHash, password as string);
      if (!ok) {
        // ONE atomic statement: counter increment + lock threshold decided
        // inside the UPDATE itself. No read-then-write on stale state.
        await recordFailedLoginAttempt(getPrisma(), user.id, now());
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

      res.cookie(SESSION_COOKIE_NAME, token, getSessionCookieOptions(req, LOGIN_SESSION_TTL_MS));
      res.status(200).json({ user: getSafeUser(updated) });
    } catch {
      sendError(res, 500, "INTERNAL_ERROR", "An unexpected error occurred. Please try again.");
    }
  });

  // GET /api/auth/me (Issue #45, Lab 3 api-spec §3.2): returns the current
  // safe user. Allowed while mustChangePassword=true, so requirePasswordChanged
  // is deliberately NOT in this chain. requireSession loads the fresh user row
  // and rejects invalid/expired sessions; requireActiveUser rejects deactivated
  // users — both with the generic 401 UNAUTHENTICATED.
  router.get("/me", requireSession, requireActiveUser, (req: Request, res: Response) => {
    try {
      const user = (req as AuthRequest).user;
      if (!user) {
        sendError(res, 401, UNAUTHENTICATED_CODE, UNAUTHENTICATED_MESSAGE);
        return;
      }
      res.status(200).json({ user: getSafeUser(user) });
    } catch {
      sendError(res, 500, "INTERNAL_ERROR", "An unexpected error occurred. Please try again.");
    }
  });

  // POST /api/auth/logout (Issue #45, Lab 3 api-spec §3.3): idempotent 204.
  // Origin IS required (state-changing) via requireOrigin. No session gate —
  // revokes the current row when the cookie maps to one, clears the cookie
  // with the same name/Path attributes, and repeats harmlessly.
  router.post("/logout", requireOrigin, async (req: Request, res: Response) => {
    try {
      const token = parseCookieToken(req);
      if (token) {
        const tokenHash = hashToken(token);
        await getPrisma().session.deleteMany({ where: { tokenHash } });
      }
      res.clearCookie(SESSION_COOKIE_NAME, getClearSessionCookieOptions(req));
      res.status(204).end();
    } catch {
      sendError(res, 500, "INTERNAL_ERROR", "An unexpected error occurred. Please try again.");
    }
  });

  // POST /api/auth/change-password (Issue #45, Lab 3 api-spec §3.4):
  // authenticated (session+active), allowed while mustChangePassword=true,
  // so requirePasswordChanged is deliberately NOT in this chain. Body is
  // exactly { currentPassword, newPassword } — confirmation is UI-only.
  // Success rotates the credential atomically: new hash + flag false +
  // invalidate ALL sessions + ONE fresh session (cookie set).
  // Any validation/verify failure returns before touching the DB, leaving
  // credential/session/mandatory state unchanged (api-spec §3.4).
  router.post(
    "/change-password",
    requireOrigin,
    requireSession,
    requireActiveUser,
    async (req: Request, res: Response) => {
      try {
        const authUser = (req as AuthRequest).user;
        if (!authUser) {
          sendError(res, 401, UNAUTHENTICATED_CODE, UNAUTHENTICATED_MESSAGE);
          return;
        }

        // Strict contract (§1.6): exactly { currentPassword, newPassword }.
        const body = (req.body ?? {}) as Record<string, unknown>;
        const allowed = new Set(["currentPassword", "newPassword"]);
        for (const key of Object.keys(body)) {
          if (!allowed.has(key)) {
            sendError(res, 400, "VALIDATION_FAILED", VALIDATION_MESSAGE, {
              [key]: "Unknown parameter.",
            });
            return;
          }
        }
        const { currentPassword, newPassword } = body;
        const fieldErrors: Record<string, string> = {};
        if (typeof currentPassword !== "string" || currentPassword.trim().length === 0) {
          fieldErrors.currentPassword = "Current password is required.";
        }
        if (typeof newPassword !== "string" || newPassword.length === 0) {
          fieldErrors.newPassword = "New password is required.";
        }
        if (Object.keys(fieldErrors).length > 0) {
          sendError(res, 400, "VALIDATION_FAILED", VALIDATION_MESSAGE, fieldErrors);
          return;
        }

        // 1. Verify current (Argon2id) against the stored hash. No DB write.
        const stored = await getPrisma().user.findUnique({
          where: { id: authUser.id },
        });
        if (!stored) {
          sendError(res, 401, UNAUTHENTICATED_CODE, UNAUTHENTICATED_MESSAGE);
          return;
        }
        const ok = await verifyPassword(
          stored.passwordHash,
          currentPassword as string
        );
        if (!ok) {
          sendError(
            res,
            400,
            CURRENT_PASSWORD_INVALID_CODE,
            CURRENT_PASSWORD_INVALID_MESSAGE
          );
          return;
        }

        // 2. Validate new password against policy (no trim/normalization;
        // blank whitespace-only input fails policy here). No DB write.
        const policyErrors = validateNewPassword(
          newPassword as string,
          currentPassword as string
        );
        if (policyErrors.length > 0) {
          sendError(res, 400, "VALIDATION_FAILED", VALIDATION_MESSAGE, {
            newPassword: `New password does not meet the password policy: ${policyErrors.join(", ")}.`,
          });
          return;
        }

        // 3. Single transaction: new hash + flag false + drop ALL sessions +
        // establish ONE fresh session. The credential update is conditional
        // on the VERIFIED old hash, so two concurrent valid changes cannot
        // both succeed: the loser sees 0 rows affected and gets a truthful
        // 400 CURRENT_PASSWORD_INVALID with no session changes.
        const newHash = await hashPassword(newPassword as string);
        const { token, tokenHash } = createSessionToken();
        const current = now();
        const expiresAt = new Date(current.getTime() + LOGIN_SESSION_TTL_MS);
        const verifiedHash = stored.passwordHash;
        let updated;
        try {
          updated = await getPrisma().$transaction(async (tx) => {
            const rotated = await tx.user.updateMany({
              where: { id: authUser.id, passwordHash: verifiedHash },
              data: { passwordHash: newHash, mustChangePassword: false },
            });
            if (rotated.count === 0) throw new Error("PASSWORD_RACE_LOST");
            await tx.session.deleteMany({ where: { userId: authUser.id } });
            await tx.session.create({
              data: { userId: authUser.id, tokenHash, expiresAt },
            });
            return tx.user.findUnique({ where: { id: authUser.id } });
          });
        } catch (txErr) {
          if (txErr instanceof Error && txErr.message === "PASSWORD_RACE_LOST") {
            sendError(
              res,
              400,
              CURRENT_PASSWORD_INVALID_CODE,
              CURRENT_PASSWORD_INVALID_MESSAGE
            );
            return;
          }
          throw txErr;
        }
        if (!updated) {
          sendError(res, 500, "INTERNAL_ERROR", "An unexpected error occurred. Please try again.");
          return;
        }

        res.cookie(SESSION_COOKIE_NAME, token, getSessionCookieOptions(req, LOGIN_SESSION_TTL_MS));
        res.status(200).json({ user: getSafeUser(updated) });
      } catch {
        sendError(res, 500, "INTERNAL_ERROR", "An unexpected error occurred. Please try again.");
      }
    }
  );

  return router;
}

const authRouter = createAuthRouter();

export default authRouter;
