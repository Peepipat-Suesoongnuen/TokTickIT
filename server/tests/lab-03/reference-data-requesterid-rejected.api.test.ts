import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import { SESSION_COOKIE_NAME, getApprovedOrigins } from "../../src/auth.js";
import { hashPassword } from "../../src/lib/password-hash.js";

// Issue #45 (PR #58 review) — reference-data routes are session-only:
// `requesterId` is not accepted. Unknown query parameter -> 400
// VALIDATION_FAILED with fieldErrors.requesterId === "Unknown parameter."
// (api-spec §4 + §1.6 strict contract). This pins the contract.
const ORIGIN = getApprovedOrigins()[0] ?? "http://localhost:5173";
const PASSWORD = "ReqId-Rej-9!";

describe("reference-data rejects requesterId (Issue #45)", () => {
  const prisma = getPrisma();
  const userEmail = `lab03-reqid-reject-${Date.now()}@test.local`;

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

  async function loginAs(): Promise<string> {
    const res = await request(app)
      .post("/api/auth/login")
      .set("Origin", ORIGIN)
      .send({ email: userEmail, password: PASSWORD })
      .expect(200);
    const cookie = sessionCookieValue(res.headers["set-cookie"]);
    expect(cookie).toBeDefined();
    return cookie as string;
  }

  beforeAll(async () => {
    await prisma.user.create({
      data: {
        name: "Lab 03 RequesterId Reject User",
        email: userEmail,
        passwordHash: await hashPassword(PASSWORD),
        role: "REQUESTER",
        isActive: true,
        mustChangePassword: false,
      },
    });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: userEmail } });
  });

  it("authenticated GET /api/categories?requesterId=1 -> 400 with fieldErrors.requesterId", async () => {
    const cookie = await loginAs();
    const res = await request(app)
      .get("/api/categories?requesterId=1")
      .set("Cookie", cookie)
      .expect(400);
    expect(res.body.error.code).toBe("VALIDATION_FAILED");
    expect(res.body.fieldErrors?.requesterId).toBe("Unknown parameter.");
  });

  it("authenticated GET /api/related-systems?requesterId=1 -> 400 with fieldErrors.requesterId", async () => {
    const cookie = await loginAs();
    const res = await request(app)
      .get("/api/related-systems?requesterId=1")
      .set("Cookie", cookie)
      .expect(400);
    expect(res.body.error.code).toBe("VALIDATION_FAILED");
    expect(res.body.fieldErrors?.requesterId).toBe("Unknown parameter.");
  });

  it("authenticated GET without param -> 200", async () => {
    const cookie = await loginAs();
    await request(app).get("/api/categories").set("Cookie", cookie).expect(200);
    await request(app).get("/api/related-systems").set("Cookie", cookie).expect(200);
  });
});
