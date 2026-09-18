import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import {
  SESSION_COOKIE_NAME,
  getApprovedOrigins,
} from "../../src/auth.js";
import { hashPassword } from "../../src/lib/password-hash.js";

// Reviewer fix 2 (Issue #45, PR #58 Chxtamos items 1-3):
// - Fix 1 (API-06 proof): the production reference-data routes
//   (GET /api/categories, GET /api/related-systems) are wired to
//   requireSession -> requireActiveUser -> requirePasswordChanged.
//   Supertest vs the REAL exported app (not a throwaway).
// - Fix 2: the code default covers both local-dev origins
//   (Vite 5173 + README/e2e 5174); default-config login from either
//   succeeds while unapproved origins still fail 403.

const ORIGIN = getApprovedOrigins()[0] ?? "http://localhost:5173";
const PASSWORD = "Gate-Valid-9!";
const NEW_PASSWORD = "Gate-Changed-1!";

const RUN = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6)}`;
const email = (local: string) => `${local}-${RUN}@example.com`;

const EMAILS = {
  mustChange: email("gate-mustchange"),
  originDefault: email("gate-origin"),
};

const prisma = getPrisma();

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

describe("reference-data auth gate wiring (Lab 3 Issue #45, reviewer fix 2)", () => {
  beforeAll(async () => {
    await prisma.user.create({
      data: {
        name: "Gate Fixture mustchange",
        email: EMAILS.mustChange,
        passwordHash: await hashPassword(PASSWORD),
        role: "REQUESTER",
        isActive: true,
        mustChangePassword: true,
      },
    });
    await prisma.user.create({
      data: {
        name: "Gate Fixture origin",
        email: EMAILS.originDefault,
        passwordHash: await hashPassword(PASSWORD),
        role: "REQUESTER",
        isActive: true,
        mustChangePassword: false,
      },
    });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { in: Object.values(EMAILS) } } });
  });

  it("logged-out requests to reference-data routes are 401 UNAUTHENTICATED", async () => {
    for (const path of ["/api/categories", "/api/related-systems"]) {
      const res = await request(app).get(path).expect(401);
      expect(res.body.error.code).toBe("UNAUTHENTICATED");
    }
  });

  it("mustChangePassword=true gets 403 PASSWORD_CHANGE_REQUIRED, then 200 after a valid change, then 401 after logout", async () => {
    const cookie = await loginAs(EMAILS.mustChange, PASSWORD);

    for (const path of ["/api/categories", "/api/related-systems"]) {
      const blocked = await request(app).get(path).set("Cookie", cookie).expect(403);
      expect(blocked.body).toEqual({
        error: {
          code: "PASSWORD_CHANGE_REQUIRED",
          message: "You must change your password before continuing.",
        },
      });
    }

    await request(app)
      .post("/api/auth/change-password")
      .set("Origin", ORIGIN)
      .set("Cookie", cookie)
      .send({ currentPassword: PASSWORD, newPassword: NEW_PASSWORD })
      .expect(200);

    const fresh = await loginAs(EMAILS.mustChange, NEW_PASSWORD);
    await request(app).get("/api/categories").set("Cookie", fresh).expect(200);
    await request(app).get("/api/related-systems").set("Cookie", fresh).expect(200);

    await request(app)
      .post("/api/auth/logout")
      .set("Origin", ORIGIN)
      .set("Cookie", fresh)
      .expect(204);
    await request(app).get("/api/categories").set("Cookie", fresh).expect(401);
  });

  it("default-config origins cover both Vite (5173) and README/e2e (5174) ports", async () => {
    // Code default (APP_ORIGINS unset) is exactly both local-dev origins.
    expect(getApprovedOrigins({})).toEqual([
      "http://localhost:5173",
      "http://localhost:5174",
    ]);

    const saved = process.env.APP_ORIGINS;
    delete process.env.APP_ORIGINS;
    try {
      await request(app)
        .post("/api/auth/login")
        .set("Origin", "http://localhost:5173")
        .send({ email: EMAILS.originDefault, password: PASSWORD })
        .expect(200);
      await request(app)
        .post("/api/auth/login")
        .set("Origin", "http://localhost:5174")
        .send({ email: EMAILS.originDefault, password: PASSWORD })
        .expect(200);
      const evil = await request(app)
        .post("/api/auth/login")
        .set("Origin", "https://evil.example")
        .send({ email: EMAILS.originDefault, password: PASSWORD })
        .expect(403);
      expect(evil.body.error.code).toBe("ORIGIN_NOT_ALLOWED");
    } finally {
      if (saved === undefined) delete process.env.APP_ORIGINS;
      else process.env.APP_ORIGINS = saved;
    }
  });
});
