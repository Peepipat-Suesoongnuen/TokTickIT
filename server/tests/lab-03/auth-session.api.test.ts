import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { createHash } from "node:crypto";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import { SESSION_COOKIE_NAME, getApprovedOrigins } from "../../src/auth.js";
import { hashPassword } from "../../src/lib/password-hash.js";

// TDD Step 1 (Issue #45, Task 4): failing API tests for GET /api/auth/me +
// POST /api/auth/logout. Supertest vs the REAL app.ts so the /api/auth mount
// + session/Origin wiring is exercised end-to-end. Fixtures use run-unique
// emails and are cleaned up.

const ORIGIN = getApprovedOrigins()[0] ?? "http://localhost:5174";
const PASSWORD = "Session-Valid-9!";

const RUN = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6)}`;
const email = (local: string) => `${local}-${RUN}@example.com`;

const EMAILS = {
  me: email("session-me"),
  expired: email("session-expired"),
  deactivated: email("session-deactivated"),
  mustChange: email("session-mustchange"),
  logout: email("session-logout"),
};

const prisma = getPrisma();

async function createUser(
  userEmail: string,
  overrides: { isActive?: boolean; mustChangePassword?: boolean } = {}
) {
  return prisma.user.create({
    data: {
      name: `Session Fixture ${userEmail}`,
      email: userEmail,
      passwordHash: await hashPassword(PASSWORD),
      role: "REQUESTER",
      isActive: overrides.isActive ?? true,
      mustChangePassword: overrides.mustChangePassword ?? false,
    },
  });
}

function sessionCookieValue(setCookie: unknown): string | undefined {
  const cookies: string[] = Array.isArray(setCookie)
    ? (setCookie as string[])
    : setCookie
      ? [setCookie as string]
      : [];
  const found = cookies.find((c) => c.startsWith(`${SESSION_COOKIE_NAME}=`));
  if (!found) return undefined;
  return found.split(";")[0];
}

// Local login helper (Task 4 pattern): POST /api/auth/login with approved
// Origin, return the raw `name=value` cookie for subsequent requests.
async function loginAs(userEmail: string, password: string): Promise<string> {
  const res = await request(app)
    .post("/api/auth/login")
    .set("Origin", ORIGIN)
    .send({ email: userEmail, password })
    .expect(200);
  const cookie = sessionCookieValue(res.headers["set-cookie"]);
  expect(cookie).toBeDefined();
  return cookie as string;
}

function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function rawTokenFromCookie(cookie: string): string {
  const value = cookie.split(";")[0]?.split("=")[1] ?? "";
  return decodeURIComponent(value);
}

describe("GET /api/auth/me + POST /api/auth/logout (Lab 3 Issue #45)", () => {
  beforeAll(async () => {
    await createUser(EMAILS.me);
    await createUser(EMAILS.expired);
    await createUser(EMAILS.deactivated);
    await createUser(EMAILS.mustChange, { mustChangePassword: true });
    await createUser(EMAILS.logout);
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { in: Object.values(EMAILS) } } });
  });

  it("me returns 200 with exactly the safe-user keys (no internals)", async () => {
    const cookie = await loginAs(EMAILS.me, PASSWORD);
    const res = await request(app).get("/api/auth/me").set("Cookie", cookie).expect(200);

    expect(res.body.user).toEqual({
      id: expect.any(Number),
      name: expect.any(String),
      email: EMAILS.me,
      role: "REQUESTER",
      active: true,
      mustChangePassword: false,
    });
    expect(Object.keys(res.body.user).sort()).toEqual(
      ["active", "email", "id", "mustChangePassword", "name", "role"]
    );

    const dumped = JSON.stringify(res.body);
    expect(dumped).not.toContain("passwordHash");
    expect(dumped).not.toContain("tokenHash");
    expect(dumped).not.toContain("failedLoginAttempts");
    expect(dumped).not.toContain("lockedUntil");
  });

  it("me works while mustChangePassword=true", async () => {
    const cookie = await loginAs(EMAILS.mustChange, PASSWORD);
    const res = await request(app).get("/api/auth/me").set("Cookie", cookie).expect(200);
    expect(res.body.user.email).toBe(EMAILS.mustChange);
    expect(res.body.user.mustChangePassword).toBe(true);
  });

  it("me with an expired session returns 401", async () => {
    const cookie = await loginAs(EMAILS.expired, PASSWORD);
    const saved = await prisma.user.findUnique({ where: { email: EMAILS.expired } });
    await prisma.session.updateMany({
      where: { userId: saved!.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const res = await request(app).get("/api/auth/me").set("Cookie", cookie).expect(401);
    expect(res.body.error.code).toBe("UNAUTHENTICATED");
  });

  it("me with a deactivated user returns 401", async () => {
    const cookie = await loginAs(EMAILS.deactivated, PASSWORD);
    await prisma.user.update({
      where: { email: EMAILS.deactivated },
      data: { isActive: false },
    });

    try {
      const res = await request(app).get("/api/auth/me").set("Cookie", cookie).expect(401);
      expect(res.body.error.code).toBe("UNAUTHENTICATED");
    } finally {
      await prisma.user.update({
        where: { email: EMAILS.deactivated },
        data: { isActive: true },
      });
    }
  });

  it("me without a session returns 401", async () => {
    const res = await request(app).get("/api/auth/me").expect(401);
    expect(res.body.error.code).toBe("UNAUTHENTICATED");
  });

  it("logout revokes the session, clears the cookie, and is idempotent", async () => {
    const cookie = await loginAs(EMAILS.logout, PASSWORD);
    const tokenHash = hashToken(rawTokenFromCookie(cookie));
    expect(await prisma.session.findUnique({ where: { tokenHash } })).not.toBeNull();

    const res = await request(app)
      .post("/api/auth/logout")
      .set("Origin", ORIGIN)
      .set("Cookie", cookie)
      .expect(204);

    // Session row is gone.
    expect(await prisma.session.findUnique({ where: { tokenHash } })).toBeNull();

    // Cookie is cleared with the same name/Path attributes.
    const setCookie = res.headers["set-cookie"];
    const cookies: string[] = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
    const cleared = cookies.find((c) => c.startsWith(`${SESSION_COOKIE_NAME}=`));
    expect(cleared).toBeDefined();
    expect(cleared).toMatch(/path=\//i);
    expect(`${cleared}`).toMatch(/Expires=Thu, 01 Jan 1970|Max-Age=0|=;/);

    // The logged-out session no longer authenticates.
    await request(app).get("/api/auth/me").set("Cookie", cookie).expect(401);

    // Repeat logout stays harmless.
    await request(app)
      .post("/api/auth/logout")
      .set("Origin", ORIGIN)
      .set("Cookie", cookie)
      .expect(204);
  });

  it("logout without an approved Origin is rejected 403", async () => {
    const res = await request(app).post("/api/auth/logout").expect(403);
    expect(res.body.error.code).toBe("ORIGIN_NOT_ALLOWED");
  });
});
