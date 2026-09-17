// Login protection helpers (Issue #45, Lab 3 api-spec §§1.3, 3.1).
//
// Account lockout: 5 CONSECUTIVE incorrect-password failures lock an
// existing account for 15 minutes. The counter increment is atomic (a single
// Prisma `update` with `{ increment: 1 }` — no read-then-write), and lock
// expiry is automatic by comparing `lockedUntil` against an injectable clock
// (`now`), so tests time-travel via DB backdate instead of sleeping.
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
export function isAccountLocked(lockedUntil: Date | null, now: Date): boolean {
  if (lockedUntil === null) return false;
  return now.getTime() < lockedUntil.getTime();
}

export interface FailedLoginUpdate {
  failedLoginAttempts: { increment: number };
  lockedUntil?: Date;
}

// Builds the data for the SINGLE atomic Prisma update on the failure path:
// `{ increment: 1 }` plus `lockedUntil` exactly when the threshold is
// reached. Callers pass the pre-increment counter they already hold from the
// user lookup, so no second read is needed.
export function buildFailedLoginUpdate(
  failedLoginAttemptsBefore: number,
  now: Date
): FailedLoginUpdate {
  const update: FailedLoginUpdate = {
    failedLoginAttempts: { increment: 1 },
  };
  if (failedLoginAttemptsBefore + 1 >= MAX_FAILED_LOGIN_ATTEMPTS) {
    update.lockedUntil = new Date(now.getTime() + LOCK_DURATION_MS);
  }
  return update;
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

// Sliding-window limiter: an IP is limited once MORE than `maxAttempts`
// attempts fall inside (now - windowMs, now]. Stale timestamps are pruned on
// every access so memory stays bounded without a sweeper.
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
      return prune(ip, now().getTime()).length > maxAttempts;
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
