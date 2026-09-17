import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import {
  SESSION_COOKIE_NAME,
  getApprovedOrigins,
} from "../../src/auth.js";
import { hashPassword } from "../../src/lib/password-hash.js";
import {
  MAX_FAILED_LOGIN_ATTEMPTS,
  createLoginRateLimiter,
} from "../../src/lib/login-protection.js";

// TDD Step 1 (Issue #45, Task 3): failing API tests for POST /api/auth/login.
// Supertest vs the REAL app.ts so the /api/auth mount + Origin + CORS wiring
// is exercised end-to-end. Fixtures use run-unique emails and are cleaned up.

// APP_ORIGINS is unset in test env, so the local-dev default applies; read it
// dynamically so this suite tracks deployment configuration instead of a copy.
const ORIGIN = getApprovedOrigins()[0] ?? "http://localhost:5174";
const PASSWORD = "Login-Valid-9!";
const WRONG_PASSWORD = "Login-Wrong-9!";

const RUN = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6)}`;
const email = (local: string) => `${local}-${RUN}@example.com`;

const EMAILS = {
  valid: email("login-valid"),
  wrongPw: email("login-wrongpw"),
  unknown: email("login-unknown"),
  inactive: email("login-inactive"),
  lockout: email("login-lockout"),
  origin: email("login-origin"),
  canon: email("login-canon"),
  mustChange: email("login-mustchange"),
  iplogin: email("login-iplogin"),
};

const prisma = getPrisma();

async function createUser(
  userEmail: string,
  overrides: {
    password?: string;
    isActive?: boolean;
    mustChangePassword?: boolean;
    failedLoginAttempts?: number;
    lockedUntil?: Date | null;
  } = {}
) {
  return prisma.user.create({
    data: {
      name: `Login Fixture ${userEmail}`,
      email: userEmail,
      passwordHash: await hashPassword(overrides.password ?? PASSWORD),
      role: "REQUESTER",
      isActive: overrides.isActive ?? true,
      mustChangePassword: overrides.mustChangePassword ?? false,
      failedLoginAttempts: overrides.failedLoginAttempts ?? 0,
      lockedUntil: overrides.lockedUntil ?? null,
    },
  });
}

function login(body: Record<string, unknown>, origin: string | null = ORIGIN) {
  const req = request(app).post("/api/auth/login").send(body);
  if (origin !== null) req.set("Origin", origin);
  return req;
}

describe("POST /api/auth/login (Lab 3 Issue #45)", () => {
  beforeAll(async () => {
    await createUser(EMAILS.valid, { failedLoginAttempts: 2 });
    await createUser(EMAILS.wrongPw);
    await createUser(EMAILS.inactive, { isActive: false });
    await createUser(EMAILS.lockout);
    await createUser(EMAILS.origin, { failedLoginAttempts: 1 });
    await createUser(EMAILS.canon);
    await createUser(EMAILS.mustChange, { mustChangePassword: true });
    await createUser(EMAILS.iplogin);
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { in: Object.values(EMAILS) } } });
  });

  it("valid login returns 200 with the safe-user shape and a hardened session cookie", async () => {
    const res = await login({ email: EMAILS.valid, password: PASSWORD }).expect(200);

    expect(res.body.user).toEqual({
      id: expect.any(Number),
      name: expect.any(String),
      email: EMAILS.valid,
      role: "REQUESTER",
      active: true,
      mustChangePassword: false,
    });
    expect(res.body).not.toHaveProperty("error");

    const setCookie = res.headers["set-cookie"];
    const cookies: string[] = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
    const sessionCookie = cookies.find((c) => c.startsWith(`${SESSION_COOKIE_NAME}=`));
    expect(sessionCookie).toBeDefined();
    expect(sessionCookie).toMatch(/httponly/i);
    expect(sessionCookie).toMatch(/samesite=lax/i);
    expect(sessionCookie).toMatch(/path=\//i);
    const maxAge = Number(/max-age=(\d+)/i.exec(sessionCookie ?? "")?.[1]);
    expect(maxAge).toBeGreaterThan(0);
    expect(maxAge).toBeLessThanOrEqual(8 * 3600);

    // Prior failed-attempt state is reset on success.
    const saved = await prisma.user.findUnique({ where: { email: EMAILS.valid } });
    expect(saved?.failedLoginAttempts).toBe(0);
    expect(saved?.lockedUntil).toBeNull();

    // A fresh ~8h server-side session backs the cookie.
    const session = await prisma.session.findFirst({
      where: { userId: saved!.id },
      orderBy: { createdAt: "desc" },
    });
    expect(session).not.toBeNull();
    const ttlMs = session!.expiresAt.getTime() - Date.now();
    expect(ttlMs).toBeGreaterThan(7 * 3600 * 1000);
    expect(ttlMs).toBeLessThanOrEqual(8 * 3600 * 1000);
  });

  it("wrong password / unknown email / inactive user fail with IDENTICAL generic 401s", async () => {
    const wrong = await login({ email: EMAILS.wrongPw, password: WRONG_PASSWORD }).expect(401);
    const unknown = await login({ email: EMAILS.unknown, password: PASSWORD }).expect(401);
    const inactive = await login({ email: EMAILS.inactive, password: PASSWORD }).expect(401);

    expect(wrong.body).toEqual({
      error: { code: "INVALID_CREDENTIALS", message: "Invalid email or password." },
    });
    // Indistinguishable: no account enumeration across the three cases.
    expect(unknown.body).toEqual(wrong.body);
    expect(inactive.body).toEqual(wrong.body);

    // No security internals leak in any failure body.
    const dumped = JSON.stringify([wrong.body, unknown.body, inactive.body]);
    expect(dumped).not.toContain("passwordHash");
    expect(dumped).not.toContain("tokenHash");
    expect(dumped).not.toContain("failedLoginAttempts");
    expect(dumped).not.toContain("lockedUntil");
    expect(dumped).not.toContain(PASSWORD);
    expect(dumped).not.toContain(WRONG_PASSWORD);
  });

  it("5 consecutive wrong passwords lock the account for 15 min; expiry restores login", async () => {
    for (let attempt = 1; attempt <= MAX_FAILED_LOGIN_ATTEMPTS; attempt += 1) {
      const res = await login({ email: EMAILS.lockout, password: WRONG_PASSWORD }).expect(401);
      expect(res.body.error.code).toBe("INVALID_CREDENTIALS");
      const saved = await prisma.user.findUnique({ where: { email: EMAILS.lockout } });
      expect(saved?.failedLoginAttempts).toBe(attempt);
    }

    const locked = await prisma.user.findUnique({ where: { email: EMAILS.lockout } });
    expect(locked?.lockedUntil).not.toBeNull();
    const lockMs = locked!.lockedUntil!.getTime() - Date.now();
    expect(lockMs).toBeGreaterThan(14 * 60 * 1000);
    expect(lockMs).toBeLessThanOrEqual(15 * 60 * 1000);

    // Correct password while locked still fails generically (no lock disclosure).
    const whileLocked = await login({ email: EMAILS.lockout, password: PASSWORD }).expect(401);
    expect(whileLocked.body).toEqual({
      error: { code: "INVALID_CREDENTIALS", message: "Invalid email or password." },
    });

    // Time-travel via DB backdate (route uses the real clock; no sleeping).
    await prisma.user.update({
      where: { email: EMAILS.lockout },
      data: { lockedUntil: new Date(Date.now() - 1000) },
    });
    await login({ email: EMAILS.lockout, password: PASSWORD }).expect(200);
    const reset = await prisma.user.findUnique({ where: { email: EMAILS.lockout } });
    expect(reset?.failedLoginAttempts).toBe(0);
    expect(reset?.lockedUntil).toBeNull();
  });

  it("IP limiter unit: sliding window blocks only past-threshold attempts, then recovers", async () => {
    let nowMs = Date.now();
    const limiter = createLoginRateLimiter({
      windowMs: 1000,
      maxAttempts: 2,
      now: () => new Date(nowMs),
    });

    expect(limiter.isLimited("10.0.0.1")).toBe(false);
    limiter.record("10.0.0.1");
    limiter.record("10.0.0.1");
    expect(limiter.isLimited("10.0.0.1")).toBe(false);
    limiter.record("10.0.0.1");
    expect(limiter.isLimited("10.0.0.1")).toBe(true);
    // Other IPs are unaffected.
    expect(limiter.isLimited("10.0.0.2")).toBe(false);

    // Sliding expiry: after the window passes, old attempts fall off.
    nowMs += 1001;
    expect(limiter.isLimited("10.0.0.1")).toBe(false);
  });

  it("normal logins pass under the default IP configuration (no 429)", async () => {
    // Full-429 API coverage would require mutating process-global env
    // mid-suite; the threshold behavior above is covered in unit scope where
    // window/max/now are injectable. Here the API asserts the deployed
    // default permits ordinary login traffic.
    for (let i = 0; i < 3; i += 1) {
      await login({ email: EMAILS.iplogin, password: PASSWORD }).expect(200);
    }
  });

  it("missing/null/unapproved Origin is rejected 403 before credential processing", async () => {
    const missing = await login({ email: EMAILS.origin, password: WRONG_PASSWORD }, null).expect(403);
    expect(missing.body).toEqual({
      error: { code: "ORIGIN_NOT_ALLOWED", message: expect.any(String) },
    });
    const nulled = await login({ email: EMAILS.origin, password: WRONG_PASSWORD }, "null").expect(403);
    expect(nulled.body.error.code).toBe("ORIGIN_NOT_ALLOWED");
    const evil = await login({ email: EMAILS.origin, password: WRONG_PASSWORD }, "https://evil.example").expect(403);
    expect(evil.body.error.code).toBe("ORIGIN_NOT_ALLOWED");

    // Rejected origins never touch failed-attempt state.
    const saved = await prisma.user.findUnique({ where: { email: EMAILS.origin } });
    expect(saved?.failedLoginAttempts).toBe(1);

    // Approved Origin proceeds.
    await login({ email: EMAILS.origin, password: PASSWORD }).expect(200);
  });

  it("email is trimmed and canonicalized case-insensitively", async () => {
    const res = await login({
      email: `  ${EMAILS.canon.toUpperCase()}  `,
      password: PASSWORD,
    }).expect(200);
    expect(res.body.user.email).toBe(EMAILS.canon);
  });

  it("mustChangePassword=true still logs in (gating is middleware business, not login)", async () => {
    const res = await login({ email: EMAILS.mustChange, password: PASSWORD }).expect(200);
    expect(res.body.user.mustChangePassword).toBe(true);
  });

  it("unknown body fields are rejected per the strict contract", async () => {
    const res = await login({ email: EMAILS.valid, password: PASSWORD, requesterId: 1 }).expect(400);
    expect(res.body.error.code).toBe("VALIDATION_FAILED");
    expect(res.body.fieldErrors.requesterId).toBeDefined();
  });

  it("missing email/password are rejected as 400 field errors", async () => {
    const noEmail = await login({ password: PASSWORD }).expect(400);
    expect(noEmail.body.error.code).toBe("VALIDATION_FAILED");
    expect(noEmail.body.fieldErrors.email).toBeDefined();
    const noPassword = await login({ email: EMAILS.valid }).expect(400);
    expect(noPassword.body.error.code).toBe("VALIDATION_FAILED");
    expect(noPassword.body.fieldErrors.password).toBeDefined();
  });
});
