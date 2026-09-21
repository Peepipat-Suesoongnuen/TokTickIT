import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import { SESSION_COOKIE_NAME } from "../../src/auth.js";
import { hashPassword } from "../../src/lib/password-hash.js";

// Issue #50 (Lab 3) — Administrator User Management (FR-15–17, AC-13–15,
// api-spec §13): minimalist list/search/create/edit/reset with safety
// invariants. Non-Administrators are forbidden before any user data.
const ORIGIN = "http://localhost:5174";
const PASSWORD = "Admin-Valid-9!";

const RUN = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6)}`;
const EMAIL_ADMIN = `q50-admin-${RUN}@test.local`;
const EMAIL_ADMIN2 = `q50-admin2-${RUN}@test.local`;
const EMAIL_STAFF = `q50-staff-${RUN}@test.local`;
const EMAIL_REQUESTER = `q50-req-${RUN}@test.local`;

export const prisma = getPrisma();

export let adminId = 0;
export let staffId = 0;
export let requesterId = 0;
export let cookieAdmin = "";
export let cookieStaff = "";
export let cookieRequester = "";

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

export async function loginAs(userEmail: string, password = PASSWORD): Promise<string> {
  const res = await request(app)
    .post("/api/auth/login")
    .set("Origin", ORIGIN)
    .send({ email: userEmail, password })
    .expect(200);
  const cookie = sessionCookieValue(res.headers["set-cookie"]);
  expect(cookie).toBeDefined();
  return cookie as string;
}

export async function makeAdminFixtures(): Promise<void> {
  const passwordHash = await hashPassword(PASSWORD);
  const users = await Promise.all(
    [
      { email: EMAIL_ADMIN, role: "ADMINISTRATOR", name: `ADM50 Admin ${RUN}` },
      { email: EMAIL_ADMIN2, role: "ADMINISTRATOR", name: `ADM50 Second ${RUN}` },
      { email: EMAIL_STAFF, role: "IT_STAFF", name: `ADM50 Staff ${RUN}` },
      { email: EMAIL_REQUESTER, role: "REQUESTER", name: `ADM50 Requester ${RUN}` },
    ].map((u) =>
      prisma.user.create({
        data: {
          name: u.name,
          email: u.email,
          passwordHash,
          role: u.role as "ADMINISTRATOR" | "IT_STAFF" | "REQUESTER",
          isActive: true,
          mustChangePassword: false,
        },
        select: { id: true },
      })
    )
  );
  [adminId, , staffId, requesterId] = [users[0].id, users[1].id, users[2].id, users[3].id];
  cookieAdmin = await loginAs(EMAIL_ADMIN);
  cookieStaff = await loginAs(EMAIL_STAFF);
  cookieRequester = await loginAs(EMAIL_REQUESTER);
}

export async function cleanupAdminFixtures(extraTicketIds: number[] = [], extraEmails: string[] = []): Promise<void> {
  if (extraTicketIds.length > 0) {
    await prisma.ticket.deleteMany({ where: { id: { in: extraTicketIds } } });
  }
  await prisma.user.deleteMany({
    where: { email: { in: [EMAIL_ADMIN, EMAIL_ADMIN2, EMAIL_STAFF, EMAIL_REQUESTER, ...extraEmails] } },
  });
}

describe("Admin user list (Issue #50, AC-13)", () => {
  beforeAll(async () => {
    await makeAdminFixtures();
  });

  // NOTE: no afterAll here — fixtures are shared with the suites below
  // (cleanup would revoke the session cookies they reuse); the final
  // suite cleans everything up.

  it("API-38: Admin lists users with safe fields, search, and optional role filter", async () => {
    const list = await request(app).get("/api/admin/users").set("Cookie", cookieAdmin).expect(200);
    expect(Array.isArray(list.body.data)).toBe(true);
    const me = (list.body.data as Array<Record<string, unknown>>).find((u) => u.email === EMAIL_ADMIN);
    expect(me).toMatchObject({ name: `ADM50 Admin ${RUN}`, role: "ADMINISTRATOR", active: true, mustChangePassword: false });
    expect(typeof me?.createdAt).toBe("string");
    // Safe fields only: no secrets ever leave the API.
    for (const u of list.body.data as Array<Record<string, unknown>>) {
      expect(Object.keys(u).sort()).toEqual(["active", "createdAt", "email", "id", "mustChangePassword", "name", "role"]);
    }

    // Case-insensitive name search.
    const byName = await request(app)
      .get("/api/admin/users")
      .query({ search: `adm50 staff` })
      .set("Cookie", cookieAdmin)
      .expect(200);
    expect((byName.body.data as Array<{ email: string }>).map((u) => u.email)).toContain(EMAIL_STAFF);

    // Email search.
    const byEmail = await request(app)
      .get("/api/admin/users")
      .query({ search: EMAIL_REQUESTER.toUpperCase() })
      .set("Cookie", cookieAdmin)
      .expect(200);
    expect((byEmail.body.data as Array<{ email: string }>).map((u) => u.email)).toContain(EMAIL_REQUESTER);

    // Optional exact role filter.
    const byRole = await request(app)
      .get("/api/admin/users")
      .query({ role: "ADMINISTRATOR" })
      .set("Cookie", cookieAdmin)
      .expect(200);
    expect((byRole.body.data as Array<{ email: string }>).map((u) => u.email)).toContain(EMAIL_ADMIN);
    for (const u of byRole.body.data as Array<{ role: string }>) {
      expect(u.role).toBe("ADMINISTRATOR");
    }
  });

  it("API-38: Status is returned but never accepted as a list filter; unknown params rejected", async () => {
    const active = await request(app)
      .get("/api/admin/users?active=true")
      .set("Cookie", cookieAdmin)
      .expect(400);
    expect(active.body.error.code).toBe("VALIDATION_FAILED");

    const unknown = await request(app)
      .get("/api/admin/users?page=2")
      .set("Cookie", cookieAdmin)
      .expect(400);
    expect(unknown.body.error.code).toBe("VALIDATION_FAILED");

    const badRole = await request(app)
      .get("/api/admin/users?role=SUPERUSER")
      .set("Cookie", cookieAdmin)
      .expect(400);
    expect(badRole.body.error.code).toBe("VALIDATION_FAILED");
  });

  it("API-46: IT Staff, Requester, and anonymous callers are forbidden before data", async () => {
    const staff = await request(app).get("/api/admin/users").set("Cookie", cookieStaff).expect(403);
    expect(staff.body.error.code).toBe("FORBIDDEN");

    const req = await request(app).get("/api/admin/users").set("Cookie", cookieRequester).expect(403);
    expect(req.body.error.code).toBe("FORBIDDEN");

    const anon = await request(app).get("/api/admin/users").expect(401);
    expect(anon.body.error.code).toBe("UNAUTHENTICATED");
  });
});

describe("Admin user creation (Issue #50, AC-13)", () => {
  const createdEmails: string[] = [];

  beforeAll(async () => {
    if (!cookieAdmin) await makeAdminFixtures();
  });

  afterAll(async () => {
    // Only suite-created users here — base fixtures stay alive for the
    // suites below (their sessions would die with them).
    await prisma.user.deleteMany({ where: { email: { in: createdEmails } } });
  });
  function validBody(email: string) {
    return {
      name: "New Staff",
      email,
      role: "IT_STAFF",
      active: true,
      initialPassword: "Create-Valid-9!",
    };
  }

  it("API-39: creates a user with one role, hashed policy password, and mandatory change", async () => {
    const email = `q50-new-${RUN}@test.local`;
    const res = await request(app)
      .post("/api/admin/users")
      .set("Cookie", cookieAdmin)
      .set("Origin", ORIGIN)
      .send(validBody(email))
      .expect(201);
    createdEmails.push(email);
    expect(res.body).toMatchObject({ name: "New Staff", email, role: "IT_STAFF", active: true, mustChangePassword: true });
    expect("passwordHash" in res.body).toBe(false);
    expect("initialPassword" in res.body).toBe(false);

    const stored = await prisma.user.findUnique({ where: { email } });
    expect(stored?.passwordHash.startsWith("$argon2id$")).toBe(true);
    expect(stored?.passwordHash).not.toContain("Create-Valid-9!");
    expect(stored).toMatchObject({ mustChangePassword: true, failedLoginAttempts: 0 });

    // Weak initial passwords are rejected without creating the user.
    const weak = await request(app)
      .post("/api/admin/users")
      .set("Cookie", cookieAdmin)
      .set("Origin", ORIGIN)
      .send({ ...validBody(`q50-weak-${RUN}@test.local`), initialPassword: "short" })
      .expect(400);
    expect(weak.body.error.code).toBe("VALIDATION_FAILED");
    expect(await prisma.user.findUnique({ where: { email: `q50-weak-${RUN}@test.local` } })).toBeNull();
  });

  it("API-39/40: name/email/role/input validated; duplicates collide case-insensitively", async () => {
    for (const [mutate, field] of [
      [(b: Record<string, unknown>) => ({ ...b, name: "A" }), "name"],
      [(b: Record<string, unknown>) => ({ ...b, email: "not-an-email" }), "email"],
      [(b: Record<string, unknown>) => ({ ...b, role: "SUPERUSER" }), "role"],
      [(b: Record<string, unknown>) => ({ ...b, active: "yes" }), "active"],
      [(b: Record<string, unknown>) => ({ ...b, unknown: 1 }), "unknown"],
    ] as Array<[(b: Record<string, unknown>) => Record<string, unknown>, string]>) {
      const res = await request(app)
        .post("/api/admin/users")
        .set("Cookie", cookieAdmin)
        .set("Origin", ORIGIN)
        .send(mutate(validBody(`q50-bad-${RUN}@test.local`)))
        .expect(400);
      expect(res.body.error.code).toBe("VALIDATION_FAILED");
      expect(field in (res.body.fieldErrors ?? {})).toBe(true);
    }

    const dup = await request(app)
      .post("/api/admin/users")
      .set("Cookie", cookieAdmin)
      .set("Origin", ORIGIN)
      .send(validBody(EMAIL_STAFF.toUpperCase()))
      .expect(409);
    expect(dup.body.error.code).toBe("EMAIL_ALREADY_EXISTS");
  });

  it("API-46: non-Administrators cannot create users", async () => {
    for (const cookie of [cookieStaff, cookieRequester]) {
      const res = await request(app)
        .post("/api/admin/users")
        .set("Cookie", cookie)
        .set("Origin", ORIGIN)
        .send(validBody(`q50-nope-${RUN}@test.local`))
        .expect(403);
      expect(res.body.error.code).toBe("FORBIDDEN");
    }
    expect(await prisma.user.findUnique({ where: { email: `q50-nope-${RUN}@test.local` } })).toBeNull();
  });
});

describe("Admin user update safety (Issue #50, AC-14)", () => {
  const extraEmails: string[] = [];
  const extraTickets: number[] = [];
  let loneAdminId = 0;
  let ownerStaffId = 0;
  let categoryId = 0;
  let relatedSystemId = 0;
  let ownerRequesterId = 0;

  beforeAll(async () => {
    const existing = await prisma.user.findUnique({ where: { email: EMAIL_ADMIN } });
    if (!existing) await makeAdminFixtures();
    const passwordHash = await hashPassword(PASSWORD);
    const lone = await prisma.user.create({
      data: {
        name: `ADM50 Lone ${RUN}`,
        email: `q50-lone-${RUN}@test.local`,
        passwordHash,
        role: "ADMINISTRATOR",
        isActive: true,
        mustChangePassword: false,
      },
      select: { id: true },
    });
    loneAdminId = lone.id;
    extraEmails.push(`q50-lone-${RUN}@test.local`);

    const owner = await prisma.user.create({
      data: {
        name: `ADM50 Owner ${RUN}`,
        email: `q50-owner-${RUN}@test.local`,
        passwordHash,
        role: "IT_STAFF",
        isActive: true,
        mustChangePassword: false,
      },
      select: { id: true },
    });
    ownerStaffId = owner.id;
    extraEmails.push(`q50-owner-${RUN}@test.local`);

    const req = await prisma.user.create({
      data: {
        name: `ADM50 OReq ${RUN}`,
        email: `q50-oreq-${RUN}@test.local`,
        passwordHash,
        role: "REQUESTER",
        isActive: true,
        mustChangePassword: false,
      },
      select: { id: true },
    });
    ownerRequesterId = req.id;
    extraEmails.push(`q50-oreq-${RUN}@test.local`);

    const category = await prisma.category.findFirst({ where: { isActive: true }, orderBy: { name: "asc" } });
    const system = await prisma.relatedSystem.findFirst({ where: { isActive: true }, orderBy: { name: "asc" } });
    if (!category || !system) throw new Error("Admin safety test requires seeded reference data");
    categoryId = category.id;
    relatedSystemId = system.id;

    const ticket = await prisma.ticket.create({
      data: {
        ticketNumber: `50${RUN.slice(-6)}-7001`,
        requesterId: ownerRequesterId,
        categoryId,
        relatedSystemId,
        summary: `Safety fixture ${RUN}`,
        description: "Safety fixture description body.",
        requestedPriority: "MEDIUM",
        itPriority: "MEDIUM",
        currentStatus: "OPEN",
        ticketOwnerId: ownerStaffId,
      },
      select: { id: true },
    });
    extraTickets.push(ticket.id);
  });

  afterAll(async () => {
    await prisma.ticket.deleteMany({ where: { id: { in: extraTickets } } });
    await prisma.publicComment.deleteMany({ where: { authorId: ownerRequesterId } });
    await prisma.ticket.deleteMany({ where: { requesterId: ownerRequesterId } });
    await prisma.user.deleteMany({ where: { email: { in: extraEmails } } });
    // Final cleanup: base suite fixtures (sessions die with them, and no
    // suite runs after this one).
    await prisma.user.deleteMany({
      where: { email: { in: [EMAIL_ADMIN, EMAIL_ADMIN2, EMAIL_STAFF, EMAIL_REQUESTER] } },
    });
  });

  it("API-41: self-deactivation is rejected atomically", async () => {
    const res = await request(app)
      .patch(`/api/admin/users/${adminId}`)
      .set("Cookie", cookieAdmin)
      .set("Origin", ORIGIN)
      .send({ active: false })
      .expect(409);
    expect(res.body.error.code).toBe("CANNOT_DEACTIVATE_SELF");
    const check = await prisma.user.findUnique({ where: { id: adminId }, select: { isActive: true } });
    expect(check?.isActive).toBe(true);
  });

  it("API-42: the last active Administrator cannot be removed, including concurrently", async () => {
    const cookieLone = await loginAs(`q50-lone-${RUN}@test.local`);
    // Hermetic last-admin setup: deactivate EVERY other active admin in
    // the shared test DB (earlier debugging runs may have left active
    // fixture admins behind), then restore them in finally.
    const second = await prisma.user.findUnique({ where: { email: EMAIL_ADMIN2 } });
    await prisma.user.update({ where: { id: second!.id }, data: { isActive: true } });
    const allActive = await prisma.user.findMany({ where: { role: "ADMINISTRATOR", isActive: true }, select: { id: true } });
    const outsiders = allActive.map((a) => a.id).filter((aid) => aid !== loneAdminId && aid !== second!.id);
    await prisma.user.updateMany({ where: { id: { in: outsiders } }, data: { isActive: false } });
    try {
      // Self-deactivation is evaluated first (BR-42): the lone admin
      // deactivating itself reports CANNOT_DEACTIVATE_SELF.
      const last = await request(app)
        .patch(`/api/admin/users/${loneAdminId}`)
        .set("Cookie", cookieLone)
        .set("Origin", ORIGIN)
        .send({ active: false })
        .expect(409);
      expect(last.body.error.code).toBe("CANNOT_DEACTIVATE_SELF");

      // Two-admin race: exactly one wins and one active admin remains.
      const cookieSecond = await loginAs(EMAIL_ADMIN2);
      const results = await Promise.all([
        request(app).patch(`/api/admin/users/${loneAdminId}`).set("Cookie", cookieSecond).set("Origin", ORIGIN).send({ active: false }),
        request(app).patch(`/api/admin/users/${second!.id}`).set("Cookie", cookieLone).set("Origin", ORIGIN).send({ active: false }),
      ]);
      const codes = results.map((r) => r.status).sort();
      expect(codes).toEqual([200, 409]);
      const loser = results.find((r) => r.status === 409)!;
      expect(loser.body.error.code).toBe("LAST_ACTIVE_ADMINISTRATOR");
      const lone = await prisma.user.findUnique({ where: { id: loneAdminId }, select: { isActive: true } });
      const other = await prisma.user.findUnique({ where: { id: second!.id }, select: { isActive: true } });
      expect([lone?.isActive, other?.isActive].filter(Boolean).length).toBe(1);
    } finally {
      await prisma.user.updateMany({ where: { id: { in: outsiders } }, data: { isActive: true } });
      await prisma.user.updateMany({ where: { email: { in: [EMAIL_ADMIN, EMAIL_ADMIN2, `q50-lone-${RUN}@test.local`] } }, data: { isActive: true, role: "ADMINISTRATOR" } });
    }
  });

  it("API-43: deactivating or demoting an active-ticket owner is rejected", async () => {
    const deact = await request(app)
      .patch(`/api/admin/users/${ownerStaffId}`)
      .set("Cookie", cookieAdmin)
      .set("Origin", ORIGIN)
      .send({ active: false })
      .expect(409);
    expect(deact.body.error.code).toBe("USER_HAS_ACTIVE_TICKETS");

    const demote = await request(app)
      .patch(`/api/admin/users/${ownerStaffId}`)
      .set("Cookie", cookieAdmin)
      .set("Origin", ORIGIN)
      .send({ role: "REQUESTER" })
      .expect(409);
    expect(demote.body.error.code).toBe("USER_HAS_ACTIVE_TICKETS");

    const check = await prisma.user.findUnique({ where: { id: ownerStaffId }, select: { isActive: true, role: true } });
    expect(check).toMatchObject({ isActive: true, role: "IT_STAFF" });
  });

  it("API-44: multi-field invalid updates change nothing", async () => {
    const res = await request(app)
      .patch(`/api/admin/users/${ownerStaffId}`)
      .set("Cookie", cookieAdmin)
      .set("Origin", ORIGIN)
      .send({ name: "Renamed Owner", role: "NOPE" })
      .expect(400);
    expect(res.body.error.code).toBe("VALIDATION_FAILED");
    const check = await prisma.user.findUnique({ where: { id: ownerStaffId }, select: { name: true, role: true } });
    expect(check).toMatchObject({ name: `ADM50 Owner ${RUN}`, role: "IT_STAFF" });
  });

  it("API-44: unknown fields and protected fields are rejected", async () => {
    const unknown = await request(app)
      .patch(`/api/admin/users/${ownerStaffId}`)
      .set("Cookie", cookieAdmin)
      .set("Origin", ORIGIN)
      .send({ nickname: "x" })
      .expect(400);
    expect(unknown.body.error.code).toBe("VALIDATION_FAILED");

    const pw = await request(app)
      .patch(`/api/admin/users/${ownerStaffId}`)
      .set("Cookie", cookieAdmin)
      .set("Origin", ORIGIN)
      .send({ passwordHash: "x" })
      .expect(400);
    expect(pw.body.error.code).toBe("VALIDATION_FAILED");
  });
});

describe("Admin initial-password reset (Issue #50, AC-15)", () => {
  const RESET_EMAIL = `q50-reset-${RUN}@test.local`;
  const RESET_PASSWORD = "Reset-Valid-9!";
  const NEW_INITIAL = "Reset-New-Valid-9!";

  beforeAll(async () => {
    // Remake base fixtures when an earlier suite cleaned them up (suite
    // order matters: the safety suite deletes base rows in its afterAll).
    const existing = await prisma.user.findUnique({ where: { email: EMAIL_ADMIN } });
    if (!existing) await makeAdminFixtures();
    const passwordHash = await hashPassword(RESET_PASSWORD);
    await prisma.user.create({
      data: {
        name: `ADM50 Reset ${RUN}`,
        email: RESET_EMAIL,
        passwordHash,
        role: "REQUESTER",
        isActive: true,
        mustChangePassword: false,
        failedLoginAttempts: 0,
      },
    });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { in: [RESET_EMAIL] } } });
  });

  it("API-45: reset applies policy, forces change, clears lock, revokes sessions, returns nothing secret", async () => {
    const target = await prisma.user.findUnique({ where: { email: RESET_EMAIL }, select: { id: true } });
    // Target holds a live session, then gets locked — reset must clear
    // both the lock and every session.
    const live = await request(app)
      .post("/api/auth/login")
      .set("Origin", ORIGIN)
      .send({ email: RESET_EMAIL, password: RESET_PASSWORD })
      .expect(200);
    const liveCookie = sessionCookieValue(live.headers["set-cookie"]);
    await prisma.user.update({
      where: { email: RESET_EMAIL },
      data: { failedLoginAttempts: 5, lockedUntil: new Date(Date.now() + 15 * 60 * 1000) },
    });

    const res = await request(app)
      .post(`/api/admin/users/${target!.id}/initial-password`)
      .set("Cookie", cookieAdmin)
      .set("Origin", ORIGIN)
      .send({ initialPassword: NEW_INITIAL })
      .expect(204);
    expect(res.text).toBe("");

    const stored = await prisma.user.findUnique({ where: { email: RESET_EMAIL } });
    expect(stored).toMatchObject({ mustChangePassword: true, failedLoginAttempts: 0, lockedUntil: null });
    expect(stored?.passwordHash.startsWith("$argon2id$")).toBe(true);
    expect(stored?.passwordHash).not.toContain(NEW_INITIAL);

    // Pre-reset session is revoked.
    const revoked = await request(app).get("/api/auth/me").set("Cookie", liveCookie!).expect(401);
    expect(revoked.body.error.code).toBe("UNAUTHENTICATED");

    // Old credential is dead; the new initial password works and lands on
    // the mandatory-change gate.
    const oldLogin = await request(app)
      .post("/api/auth/login")
      .set("Origin", ORIGIN)
      .send({ email: RESET_EMAIL, password: RESET_PASSWORD })
      .expect(401);
    expect(oldLogin.body.error.code).toBe("INVALID_CREDENTIALS");

    const fresh = await request(app)
      .post("/api/auth/login")
      .set("Origin", ORIGIN)
      .send({ email: RESET_EMAIL, password: NEW_INITIAL })
      .expect(200);
    expect(fresh.body.user).toMatchObject({ email: RESET_EMAIL, mustChangePassword: true });

    // Weak policy rejected with no partial change.
    const weak = await request(app)
      .post(`/api/admin/users/${target!.id}/initial-password`)
      .set("Cookie", cookieAdmin)
      .set("Origin", ORIGIN)
      .send({ initialPassword: "weak" })
      .expect(400);
    expect(weak.body.error.code).toBe("VALIDATION_FAILED");
    const after = await prisma.user.findUnique({ where: { email: RESET_EMAIL }, select: { mustChangePassword: true } });
    expect(after?.mustChangePassword).toBe(true);
  });

  it("API-45/46: reset validates target, body, and role boundary", async () => {
    const target = await prisma.user.findUnique({ where: { email: RESET_EMAIL }, select: { id: true } });

    const missing = await request(app)
      .post("/api/admin/users/999999999/initial-password")
      .set("Cookie", cookieAdmin)
      .set("Origin", ORIGIN)
      .send({ initialPassword: NEW_INITIAL })
      .expect(404);
    expect(missing.body.error.code).toBe("USER_NOT_FOUND");

    const unknown = await request(app)
      .post(`/api/admin/users/${target!.id}/initial-password`)
      .set("Cookie", cookieAdmin)
      .set("Origin", ORIGIN)
      .send({ initialPassword: NEW_INITIAL, extra: 1 })
      .expect(400);
    expect(unknown.body.error.code).toBe("VALIDATION_FAILED");

    const staff = await request(app)
      .post(`/api/admin/users/${target!.id}/initial-password`)
      .set("Cookie", cookieStaff)
      .set("Origin", ORIGIN)
      .send({ initialPassword: NEW_INITIAL })
      .expect(403);
    expect(staff.body.error.code).toBe("FORBIDDEN");
  });
});
