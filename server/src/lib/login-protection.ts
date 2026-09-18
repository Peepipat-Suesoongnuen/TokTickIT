import type { PrismaClient } from "@prisma/client";

// Login protection helpers (Issue #45, Lab 3 api-spec §§1.3, 3.1).
//
// Account lockout: 5 CONSECUTIVE incorrect-password failures lock an
// existing account for 15 minutes. The failure path is ONE atomic SQL
// statement (counter increment + lock threshold decided inside the UPDATE
// itself), so concurrent failures cannot bypass the lock via stale reads.
// Lock expiry is automatic by comparing `lockedUntil` against an injectable
// clock (`now`), so tests time-travel via DB backdate instead of sleeping.
//
// IP limiter: in-memory Map<ip, attempt timestamps> with a sliding window,
// configured via LOGIN_RATE_LIMIT_WINDOW_MS / LOGIN_RATE_LIMIT_MAX_ATTEMPTS.
// Pure and testable: window/max/now are constructor params, defaulting to env.
//
// Nothing here logs or returns passwords, hashes, tokens, counters, or lock
// state (api-spec §1.4).

export const MAX_FAILED_LOGIN_ATTEMPTS = 5;
export const LOCK_DURATION_MS = 15 * 60 * 1000;

export const DEFAULT_LOGIN_RATE_LIMIT_WINDOW_MS = 60000;
export const DEFAULT_LOGIN_RATE_LIMIT_MAX_ATTEMPTS = 20;

// Locked iff a lock timestamp exists and now is still before it. Expired (or
// absent) locks fail open automatically — no sweeper or disclosure needed.
// `undefined` is treated as unlocked (defensive: callers with optional
// fields must not lock users on missing data).
export function isAccountLocked(lockedUntil: Date | null | undefined, now: Date): boolean {
  if (lockedUntil === null || lockedUntil === undefined) return false;
  return now.getTime() < lockedUntil.getTime();
}

// Records ONE failed login attempt atomically: the counter increment AND
// the lock-threshold decision happen inside a single UPDATE, so N concurrent
// failures from any starting counter always converge on the same locked
// state (no read-then-write, no stale-counter lock bypass). All values are
// bound as parameters — never interpolated.
export async function recordFailedLoginAttempt(
  prisma: Pick<PrismaClient, "$executeRaw">,
  userId: number,
  now: Date
): Promise<void> {
  // Bind the lock instant as an ISO-8601 string with offset: binding a raw
  // Date shifts by the DB session timezone on timestamp-without-tz columns
  // (measured -7h when pg runs America/Los_Angeles). The offset-aware parse
  // plus AT TIME ZONE 'UTC' stores the UTC wall clock — the same convention
  // as the ORM write path — so ORM reads round-trip exactly on any pg
  // session timezone.
  const lockAtIso = new Date(now.getTime() + LOCK_DURATION_MS).toISOString();
  await prisma.$executeRaw`
    UPDATE "User" SET "failedLoginAttempts" = "failedLoginAttempts" + 1,
      "lockedUntil" = CASE WHEN "failedLoginAttempts" + 1 >= ${MAX_FAILED_LOGIN_ATTEMPTS} THEN CAST(${lockAtIso} AS timestamptz) AT TIME ZONE 'UTC' ELSE "lockedUntil" END
    WHERE "id" = ${userId}`;
}

export interface LoginRateLimitConfig {
  windowMs: number;
  maxAttempts: number;
}

// Parses deployment configuration from env, falling back to the documented
// defaults (server/.env.example) on missing/non-numeric/non-positive values.
export function getLoginRateLimitConfig(
  env: Record<string, string | undefined> = process.env
): LoginRateLimitConfig {
  const windowMs = Number(env.LOGIN_RATE_LIMIT_WINDOW_MS);
  const maxAttempts = Number(env.LOGIN_RATE_LIMIT_MAX_ATTEMPTS);
  return {
    windowMs:
      Number.isSafeInteger(windowMs) && windowMs > 0
        ? windowMs
        : DEFAULT_LOGIN_RATE_LIMIT_WINDOW_MS,
    maxAttempts:
      Number.isSafeInteger(maxAttempts) && maxAttempts > 0
        ? maxAttempts
        : DEFAULT_LOGIN_RATE_LIMIT_MAX_ATTEMPTS,
  };
}

export interface LoginRateLimiterOptions {
  windowMs?: number;
  maxAttempts?: number;
  now?: () => Date;
}

export interface LoginRateLimiter {
  isLimited: (ip: string) => boolean;
  record: (ip: string) => void;
  clear: () => void;
}

// Sliding-window limiter: an IP is limited once `maxAttempts` attempts fall
// inside (now - windowMs, now], i.e. the (N+1)-th request is rejected when
// max is N. Stale timestamps are pruned on every access so memory stays
// bounded without a sweeper.
export function createLoginRateLimiter(
  options: LoginRateLimiterOptions = {}
): LoginRateLimiter {
  const config = getLoginRateLimitConfig(process.env);
  const windowMs = options.windowMs ?? config.windowMs;
  const maxAttempts = options.maxAttempts ?? config.maxAttempts;
  const now = options.now ?? (() => new Date());
  const attempts = new Map<string, number[]>();

  function prune(ip: string, nowMs: number): number[] {
    const kept = (attempts.get(ip) ?? []).filter((t) => t > nowMs - windowMs);
    if (kept.length === 0) {
      attempts.delete(ip);
    } else {
      attempts.set(ip, kept);
    }
    return kept;
  }

  return {
    isLimited(ip: string): boolean {
      return prune(ip, now().getTime()).length >= maxAttempts;
    },
    record(ip: string): void {
      const nowMs = now().getTime();
      const kept = prune(ip, nowMs);
      kept.push(nowMs);
      attempts.set(ip, kept);
    },
    clear(): void {
      attempts.clear();
    },
  };
}

// Process-wide limiter backing the login route. Only FAILED logins are
// recorded (brute-force signal): legitimate users with correct credentials
// never trip it, which also keeps the shared-process test suite
// deterministic regardless of how many API logins run in one window.
let sharedLimiter: LoginRateLimiter | null = null;

export function getLoginRateLimiter(): LoginRateLimiter {
  if (!sharedLimiter) {
    sharedLimiter = createLoginRateLimiter();
  }
  return sharedLimiter;
}
