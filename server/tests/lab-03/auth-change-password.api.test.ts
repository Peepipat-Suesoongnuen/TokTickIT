import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import { SESSION_COOKIE_NAME, getApprovedOrigins } from "../../src/auth.js";
import { hashPassword, verifyPassword } from "../../src/lib/password-hash.js";

// TDD Step 1 (Issue #45, Task 5): failing API tests for
// POST /api/auth/change-password. Supertest vs the REAL app.ts so the
// /api/auth mount + session/Origin wiring is exercised end-to-end.
// Fixtures use run-unique emails and are cleaned up.

const ORIGIN = getApprovedOrigins()[0] ?? "http://localhost:5174";
const CURRENT = "Change-Me-Valid-1!";

const RUN = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6)}`;
const email = (local: string) => `${local}-${RUN}@example.com`;

const EMAILS = {
  valid: email("chg-valid"),
  policy: email("chg-policy"),
  wrong: email("chg-wrong"),
  mustChange: email("chg-mustchange"),
  fields: email("chg-fields"),
  blank: email("chg-blank"),
};

const prisma = getPrisma();

// 64 code points: "Ä" (upper) + "ä" x 61 (lower) + "0!" (lower + special).
const MULTIBYTE_NEW = "Ä" + "ä".repeat(61) + "0!";
const SIMPLE_NEW = "Changed-Valid-2@";

async function createUser(
  userEmail: string,
  overrides: { mustChangePassword?: boolean } = {}
) {
  return prisma.user.create({
    data: {
      name: `Change Fixture ${userEmail}`,
      email: userEmail,
      passwordHash: await hashPassword(CURRENT),
      role: "REQUESTER",
      isActive: true,
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

describe("POST /api/auth/change-password (Lab 3 Issue #45)", () => {
  beforeAll(async () => {
    await createUser(EMAILS.valid);
    await createUser(EMAILS.policy);
    await createUser(EMAILS.wrong);
    await createUser(EMAILS.mustChange, { mustChangePassword: true });
    await createUser(EMAILS.fields);
    await createUser(EMAILS.blank);
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { in: Object.values(EMAILS) } } });
  });

  it("valid change incl. multibyte boundary rotates hash and sessions", async () => {
    expect([...MULTIBYTE_NEW].length).toBe(64);
    const before = await prisma.user.findUnique({ where: { email: EMAILS.valid } });
    const oldHash = before!.passwordHash;
    const cookieA = await loginAs(EMAILS.valid, CURRENT);
    const cookieB = await loginAs(EMAILS.valid, CURRENT);

    const res = await request(app)
      .post("/api/auth/change-password")
      .set("Origin", ORIGIN)
      .set("Cookie", cookieA)
      .send({ currentPassword: CURRENT, newPassword: MULTIBYTE_NEW })
      .expect(200);

    expect(res.body.user.email).toBe(EMAILS.valid);
    expect(res.body.user.mustChangePassword).toBe(false);

    const after = await prisma.user.findUnique({ where: { email: EMAILS.valid } });
    expect(after!.mustChangePassword).toBe(false);
    expect(after!.passwordHash).not.toBe(oldHash);
    expect(await verifyPassword(after!.passwordHash, MULTIBYTE_NEW)).toBe(true);

    // ALL old sessions are invalidated.
    await request(app).get("/api/auth/me").set("Cookie", cookieA).expect(401);
    await request(app).get("/api/auth/me").set("Cookie", cookieB).expect(401);

    // ONE fresh session is established via the response cookie.
    const fresh = sessionCookieValue(res.headers["set-cookie"]);
    expect(fresh).toBeDefined();
    await request(app).get("/api/auth/me").set("Cookie", fresh!).expect(200);
  });

  it("invalid policy leaves credential/session/mandatory state unchanged", async () => {
    const before = await prisma.user.findUnique({ where: { email: EMAILS.policy } });
    const cookie = await loginAs(EMAILS.policy, CURRENT);
    const sessionsBefore = await prisma.session.findMany({
      where: { userId: before!.id },
    });

    const tooShort = await request(app)
      .post("/api/auth/change-password")
      .set("Origin", ORIGIN)
      .set("Cookie", cookie)
      .send({ currentPassword: CURRENT, newPassword: "short" })
      .expect(400);
    expect(tooShort.body.error.code).toBe("VALIDATION_FAILED");
    expect(tooShort.body.fieldErrors?.newPassword).toBeDefined();
    expect(String(tooShort.body.fieldErrors?.newPassword)).toContain("TOO_SHORT");

    const sameAsCurrent = await request(app)
      .post("/api/auth/change-password")
      .set("Origin", ORIGIN)
      .set("Cookie", cookie)
      .send({ currentPassword: CURRENT, newPassword: CURRENT })
      .expect(400);
    expect(sameAsCurrent.body.error.code).toBe("VALIDATION_FAILED");
    expect(sameAsCurrent.body.fieldErrors?.newPassword).toBeDefined();
    expect(String(sameAsCurrent.body.fieldErrors?.newPassword)).toContain("SAME_AS_CURRENT");

    const after = await prisma.user.findUnique({ where: { email: EMAILS.policy } });
    expect(await verifyPassword(after!.passwordHash, CURRENT)).toBe(true);
    expect(after!.mustChangePassword).toBe(before!.mustChangePassword);
    const sessionsAfter = await prisma.session.findMany({
      where: { userId: before!.id },
    });
    expect(sessionsAfter.map((s) => s.tokenHash).sort()).toEqual(
      sessionsBefore.map((s) => s.tokenHash).sort()
    );
    await request(app).get("/api/auth/me").set("Cookie", cookie).expect(200);
  });

  it("wrong current password leaves credential/session/mandatory state unchanged", async () => {
    const before = await prisma.user.findUnique({ where: { email: EMAILS.wrong } });
    const cookie = await loginAs(EMAILS.wrong, CURRENT);
    const sessionsBefore = await prisma.session.findMany({
      where: { userId: before!.id },
    });

    const res = await request(app)
      .post("/api/auth/change-password")
      .set("Origin", ORIGIN)
      .set("Cookie", cookie)
      .send({ currentPassword: "Wrong-Current-9!", newPassword: SIMPLE_NEW })
      .expect(400);
    expect(res.body.error.code).toBe("CURRENT_PASSWORD_INVALID");

    const after = await prisma.user.findUnique({ where: { email: EMAILS.wrong } });
    expect(await verifyPassword(after!.passwordHash, CURRENT)).toBe(true);
    expect(after!.mustChangePassword).toBe(before!.mustChangePassword);
    const sessionsAfter = await prisma.session.findMany({
      where: { userId: before!.id },
    });
    expect(sessionsAfter.map((s) => s.tokenHash).sort()).toEqual(
      sessionsBefore.map((s) => s.tokenHash).sort()
    );
    await request(app).get("/api/auth/me").set("Cookie", cookie).expect(200);
  });

  it("works while mustChangePassword=true", async () => {
    const cookie = await loginAs(EMAILS.mustChange, CURRENT);
    const res = await request(app)
      .post("/api/auth/change-password")
      .set("Origin", ORIGIN)
      .set("Cookie", cookie)
      .send({ currentPassword: CURRENT, newPassword: SIMPLE_NEW })
      .expect(200);
    expect(res.body.user.mustChangePassword).toBe(false);

    const fresh = sessionCookieValue(res.headers["set-cookie"]);
    expect(fresh).toBeDefined();
    const me = await request(app).get("/api/auth/me").set("Cookie", fresh!).expect(200);
    expect(me.body.user.mustChangePassword).toBe(false);
  });

  it("missing/blank fields and unknown extra field are rejected 400", async () => {
    const cookie = await loginAs(EMAILS.fields, CURRENT);

    await request(app)
      .post("/api/auth/change-password")
      .set("Origin", ORIGIN)
      .set("Cookie", cookie)
      .send({ currentPassword: CURRENT })
      .expect(400);

    await request(app)
      .post("/api/auth/change-password")
      .set("Origin", ORIGIN)
      .set("Cookie", cookie)
      .send({ currentPassword: "   ", newPassword: SIMPLE_NEW })
      .expect(400);

    await request(app)
      .post("/api/auth/change-password")
      .set("Origin", ORIGIN)
      .set("Cookie", cookie)
      .send({ currentPassword: CURRENT, newPassword: "   " })
      .expect(400);

    await request(app)
      .post("/api/auth/change-password")
      .set("Origin", ORIGIN)
      .set("Cookie", cookie)
      .send({ currentPassword: CURRENT, newPassword: SIMPLE_NEW, confirmPassword: SIMPLE_NEW })
      .expect(400);
  });

  it("whitespace-only currentPassword is rejected 400 VALIDATION_FAILED with zero state change", async () => {
    const before = await prisma.user.findUnique({ where: { email: EMAILS.blank } });
    const cookie = await loginAs(EMAILS.blank, CURRENT);
    const sessionsBefore = await prisma.session.findMany({
      where: { userId: before!.id },
    });

    const res = await request(app)
      .post("/api/auth/change-password")
      .set("Origin", ORIGIN)
      .set("Cookie", cookie)
      .send({ currentPassword: "   ", newPassword: SIMPLE_NEW })
      .expect(400);
    expect(res.body.error.code).toBe("VALIDATION_FAILED");
    expect(res.body.fieldErrors?.currentPassword).toBeDefined();

    const after = await prisma.user.findUnique({ where: { email: EMAILS.blank } });
    expect(after!.passwordHash).toBe(before!.passwordHash);
    expect(await verifyPassword(after!.passwordHash, CURRENT)).toBe(true);
    expect(after!.mustChangePassword).toBe(before!.mustChangePassword);
    const sessionsAfter = await prisma.session.findMany({
      where: { userId: before!.id },
    });
    expect(sessionsAfter.map((s) => s.tokenHash).sort()).toEqual(
      sessionsBefore.map((s) => s.tokenHash).sort()
    );
    await request(app).get("/api/auth/me").set("Cookie", cookie).expect(200);
  });

  it("concurrent valid changes: exactly ONE 200, never two successes, winner session works", async () => {
    // Race regression (reviewer fix 2, Fix 3): two sessions fire valid
    // changes concurrently (Promise.all, no sleep). The conditional
    // credential update + full session rotation guarantee exactly one
    // success — the old verify-then-update could return 200 twice with the
    // loser's fresh cookie dead on arrival.
    //
    // The loser's status is timing-dependent but always truthful, so the
    // deterministic assertions are: exactly one 200, no loser cookie, final
    // hash matches the winner only, winner cookie works, old sessions dead.
    // - 400 CURRENT_PASSWORD_INVALID: loser reached the handler after the
    //   winner's conditional rotation (verified hash no longer current).
    // - 401 UNAUTHENTICATED: the winner's rotation locked+deleted the
    //   loser's session row before the loser's own session lookup resolved
    //   (Postgres READ COMMITTED lock-wait -> row dead -> null). Observed
    //   both outcomes across repeated runs, so both are accepted here.
    const raceEmail = email("chg-race");
    await createUser(raceEmail);
    try {
      const cookieA = await loginAs(raceEmail, CURRENT);
      const cookieB = await loginAs(raceEmail, CURRENT);
      const newA = "Race-Winner-A-1!";
      const newB = "Race-Winner-B-2@";

      const [resA, resB] = await Promise.all([
        request(app)
          .post("/api/auth/change-password")
          .set("Origin", ORIGIN)
          .set("Cookie", cookieA)
          .send({ currentPassword: CURRENT, newPassword: newA }),
        request(app)
          .post("/api/auth/change-password")
          .set("Origin", ORIGIN)
          .set("Cookie", cookieB)
          .send({ currentPassword: CURRENT, newPassword: newB }),
      ]);

      expect([resA.status, resB.status].filter((s) => s === 200)).toHaveLength(1);
      const winner = resA.status === 200 ? { res: resA, pw: newA } : { res: resB, pw: newB };
      const loser = resA.status === 200 ? resB : resA;
      expect([400, 401]).toContain(loser.status);
      if (loser.status === 400) {
        expect(loser.body.error.code).toBe("CURRENT_PASSWORD_INVALID");
      } else {
        expect(loser.body.error.code).toBe("UNAUTHENTICATED");
      }
      // Loser made no session changes (no fresh cookie issued).
      expect(sessionCookieValue(loser.headers["set-cookie"])).toBeUndefined();

      const saved = await prisma.user.findUnique({ where: { email: raceEmail } });
      const loserPw = winner.pw === newA ? newB : newA;
      expect(await verifyPassword(saved!.passwordHash, winner.pw)).toBe(true);
      expect(await verifyPassword(saved!.passwordHash, loserPw)).toBe(false);
      expect(await verifyPassword(saved!.passwordHash, CURRENT)).toBe(false);

      const fresh = sessionCookieValue(winner.res.headers["set-cookie"]);
      expect(fresh).toBeDefined();
      await request(app).get("/api/auth/me").set("Cookie", fresh!).expect(200);
      await request(app).get("/api/auth/me").set("Cookie", cookieA).expect(401);
      await request(app).get("/api/auth/me").set("Cookie", cookieB).expect(401);
    } finally {
      await prisma.user.deleteMany({ where: { email: raceEmail } });
    }
  });
});
