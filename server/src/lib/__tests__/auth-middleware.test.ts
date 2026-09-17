import { describe, expect, it } from "vitest";
import express from "express";
import request from "supertest";
import {
  SESSION_COOKIE_NAME,
  PASSWORD_CHANGE_ALLOWLIST,
  createAuthMiddleware,
  getApprovedOrigins,
  getSafeUser,
  isOriginAllowed,
  requireActiveUser,
  requireOrigin,
  requirePasswordChanged,
  requireSession,
} from "../../auth.js";

// TDD Step 1 (Issue #45, Task 2): failing tests for the auth middleware
// chain. Pure parts are tested without a DB; middleware order/interaction
// is tested with Supertest against a minimal throwaway Express app defined
// in this file (app.ts is NOT touched for this).

const APPROVED = "https://app.toktickit.example";
const RAW_TOKEN = "a".repeat(64);

function fakeUser(overrides: Record<string, unknown> = {}) {
  return {
    id: 12,
    name: "Alice Example",
    email: "alice@example.com",
    role: "REQUESTER",
    isActive: true,
    mustChangePassword: false,
    passwordHash: "argon2-phc-secret",
    failedLoginAttempts: 3,
    lockedUntil: new Date("2026-09-17T09:00:00.000Z"),
    ...overrides,
  };
}

function futureExpiry() {
  return new Date(Date.now() + 8 * 3600 * 1000);
}

interface ChainScenario {
  session?: { id: number; userId: number; expiresAt: Date } | null;
  user?: Record<string, unknown> | null;
  allowedOrigins?: string[];
}

// Throwaway app chaining requireOrigin -> requireSession -> requireActiveUser
// -> requirePasswordChanged -> handler. The session/user loader is injected
// (stubbed), so no DB is needed.
function buildChainApp(scenario: ChainScenario) {
  const { requireOrigin, requireSession, requireActiveUser, requirePasswordChanged } =
    createAuthMiddleware({
      getAllowedOrigins: () => scenario.allowedOrigins ?? [APPROVED],
      loadSession: async () => {
        if (!scenario.session || !scenario.user) return null;
        return { session: scenario.session, user: scenario.user as never };
      },
    });
  const app = express();
  app.use(express.json());
  app.use(requireOrigin);
  app.use(requireSession);
  app.use(requireActiveUser);
  app.use(requirePasswordChanged);
  app.get("/api/auth/me", (req, res) => res.status(200).json({ user: getSafeUser((req as never as { user: never }).user) }));
  app.post("/api/auth/change-password", (_req, res) => res.status(200).json({ ok: true }));
  app.post("/api/auth/logout", (_req, res) => res.status(204).end());
  app.get("/api/tickets", (_req, res) => res.status(200).json({ ok: true }));
  app.post("/api/tickets", (_req, res) => res.status(201).json({ ok: true }));
  return app;
}

function authed(scenario: ChainScenario) {
  return buildChainApp({
    session: { id: 1, userId: 12, expiresAt: futureExpiry() },
    user: fakeUser(),
    ...scenario,
  });
}

describe("origin helpers (pure, no DB)", () => {
  it("getApprovedOrigins falls back to the local-dev default when unset", () => {
    expect(getApprovedOrigins({})).toEqual(["http://localhost:5174"]);
  });
  it("getApprovedOrigins parses comma-separated values, trims, drops empties", () => {
    expect(
      getApprovedOrigins({ APP_ORIGINS: " https://a.example , ,https://b.example, " })
    ).toEqual(["https://a.example", "https://b.example"]);
  });
  it("getApprovedOrigins returns [] (deny all) when set but empty", () => {
    expect(getApprovedOrigins({ APP_ORIGINS: "  , " })).toEqual([]);
  });
  it("isOriginAllowed matches exactly; undefined/empty/'null' never allowed", () => {
    expect(isOriginAllowed(APPROVED, [APPROVED])).toBe(true);
    expect(isOriginAllowed(undefined, [APPROVED])).toBe(false);
    expect(isOriginAllowed("", [APPROVED])).toBe(false);
    expect(isOriginAllowed("null", [APPROVED])).toBe(false);
    expect(isOriginAllowed("https://evil.example", [APPROVED])).toBe(false);
    expect(isOriginAllowed(APPROVED.toUpperCase(), [APPROVED])).toBe(false);
    expect(isOriginAllowed(APPROVED, [])).toBe(false);
  });
});

describe("safe-user mapping (pure, no DB)", () => {
  it("maps isActive->active and strips internals", () => {
    const safe = getSafeUser(fakeUser() as never);
    expect(safe).toEqual({
      id: 12,
      name: "Alice Example",
      email: "alice@example.com",
      role: "REQUESTER",
      active: true,
      mustChangePassword: false,
    });
    expect(safe).not.toHaveProperty("passwordHash");
    expect(safe).not.toHaveProperty("failedLoginAttempts");
    expect(safe).not.toHaveProperty("lockedUntil");
    expect(safe).not.toHaveProperty("isActive");
  });
});

describe("middleware chain order/interaction (throwaway app, stubbed loader)", () => {
  it("exact approved Origin passes to the handler", async () => {
    const res = await request(authed({}))
      .post("/api/tickets")
      .set("Origin", APPROVED)
      .set("Cookie", `${SESSION_COOKIE_NAME}=${RAW_TOKEN}`)
      .send({});
    expect(res.status).toBe(201);
  });
  it("missing/null/unapproved Origin on state-changing request -> 403 ORIGIN_NOT_ALLOWED", async () => {
    const missing = await request(authed({})).post("/api/tickets").set("Cookie", `${SESSION_COOKIE_NAME}=${RAW_TOKEN}`).send({});
    expect(missing.status).toBe(403);
    expect(missing.body).toEqual({ error: { code: "ORIGIN_NOT_ALLOWED", message: expect.any(String) } });
    const nulled = await request(authed({}))
      .post("/api/tickets")
      .set("Origin", "null")
      .set("Cookie", `${SESSION_COOKIE_NAME}=${RAW_TOKEN}`)
      .send({});
    expect(nulled.status).toBe(403);
    expect(nulled.body.error.code).toBe("ORIGIN_NOT_ALLOWED");
    const evil = await request(authed({}))
      .post("/api/tickets")
      .set("Origin", "https://evil.example")
      .set("Cookie", `${SESSION_COOKIE_NAME}=${RAW_TOKEN}`)
      .send({});
    expect(evil.status).toBe(403);
    expect(evil.body.error.code).toBe("ORIGIN_NOT_ALLOWED");
  });
  it("GET with a bad Origin passes through the Origin gate (session still enforced)", async () => {
    const ok = await request(authed({}))
      .get("/api/tickets")
      .set("Origin", "https://evil.example")
      .set("Cookie", `${SESSION_COOKIE_NAME}=${RAW_TOKEN}`);
    expect(ok.status).toBe(200);
    const noSession = await request(authed({})).get("/api/tickets").set("Origin", "https://evil.example");
    expect(noSession.status).toBe(401);
  });
  it("unknown session (loader null) -> 401", async () => {
    const res = await request(buildChainApp({ allowedOrigins: [APPROVED], session: null, user: null }))
      .post("/api/tickets")
      .set("Origin", APPROVED)
      .set("Cookie", `${SESSION_COOKIE_NAME}=${RAW_TOKEN}`)
      .send({});
    expect(res.status).toBe(401);
  });
  it("missing cookie -> 401", async () => {
    const res = await request(authed({})).post("/api/tickets").set("Origin", APPROVED).send({});
    expect(res.status).toBe(401);
  });
  it("expired session -> 401", async () => {
    const app = buildChainApp({
      allowedOrigins: [APPROVED],
      session: { id: 1, userId: 12, expiresAt: new Date(Date.now() - 1000) },
      user: fakeUser(),
    });
    const res = await request(app)
      .post("/api/tickets")
      .set("Origin", APPROVED)
      .set("Cookie", `${SESSION_COOKIE_NAME}=${RAW_TOKEN}`)
      .send({});
    expect(res.status).toBe(401);
  });
  it("inactive user -> 401", async () => {
    const res = await request(authed({ user: fakeUser({ isActive: false }) }))
      .post("/api/tickets")
      .set("Origin", APPROVED)
      .set("Cookie", `${SESSION_COOKIE_NAME}=${RAW_TOKEN}`)
      .send({});
    expect(res.status).toBe(401);
  });
  it("mustChangePassword blocks /api/tickets with 403 + contract message", async () => {
    const res = await request(authed({ user: fakeUser({ mustChangePassword: true }) }))
      .post("/api/tickets")
      .set("Origin", APPROVED)
      .set("Cookie", `${SESSION_COOKIE_NAME}=${RAW_TOKEN}`)
      .send({});
    expect(res.status).toBe(403);
    expect(res.body).toEqual({
      error: {
        code: "PASSWORD_CHANGE_REQUIRED",
        message: "You must change your password before continuing.",
      },
    });
  });
  it("mustChangePassword allows exactly the 3 auth paths", async () => {
    const scenario = { user: fakeUser({ mustChangePassword: true }) };
    const me = await request(authed(scenario)).get("/api/auth/me").set("Cookie", `${SESSION_COOKIE_NAME}=${RAW_TOKEN}`);
    expect(me.status).toBe(200);
    const change = await request(authed(scenario))
      .post("/api/auth/change-password")
      .set("Origin", APPROVED)
      .set("Cookie", `${SESSION_COOKIE_NAME}=${RAW_TOKEN}`)
      .send({});
    expect(change.status).toBe(200);
    const logout = await request(authed(scenario))
      .post("/api/auth/logout")
      .set("Origin", APPROVED)
      .set("Cookie", `${SESSION_COOKIE_NAME}=${RAW_TOKEN}`)
      .send({});
    expect(logout.status).toBe(204);
  });
  it("password-gate allowlist is exactly the 3 auth paths", () => {
    expect([...PASSWORD_CHANGE_ALLOWLIST].sort()).toEqual(
      ["/api/auth/me", "/api/auth/change-password", "/api/auth/logout"].sort()
    );
  });
  it("error bodies never leak tokens, hashes, counters, or lock timestamps", async () => {
    const app = authed({ user: fakeUser({ mustChangePassword: true }) });
    const bodies: unknown[] = [];
    for (const r of [
      await request(app).post("/api/tickets").set("Origin", APPROVED).set("Cookie", `${SESSION_COOKIE_NAME}=${RAW_TOKEN}`).send({}),
      await request(app).post("/api/tickets").set("Cookie", `${SESSION_COOKIE_NAME}=nope`).send({}),
      await request(authed({ user: fakeUser({ isActive: false }) }))
        .post("/api/tickets")
        .set("Origin", APPROVED)
        .set("Cookie", `${SESSION_COOKIE_NAME}=${RAW_TOKEN}`)
        .send({}),
    ]) {
      bodies.push(r.body);
    }
    const dumped = JSON.stringify(bodies);
    expect(dumped).not.toContain(RAW_TOKEN);
    expect(dumped).not.toContain("passwordHash");
    expect(dumped).not.toContain("tokenHash");
    expect(dumped).not.toContain("failedLoginAttempts");
    expect(dumped).not.toContain("lockedUntil");
  });
});

describe("middleware exports (default Prisma-bound instances)", () => {
  it("exposes the chain middleware with the session cookie name", () => {
    expect(SESSION_COOKIE_NAME).toBe("toktickit_session");
    expect(typeof requireOrigin).toBe("function");
    expect(typeof requireSession).toBe("function");
    expect(typeof requireActiveUser).toBe("function");
    expect(typeof requirePasswordChanged).toBe("function");
    expect(typeof createAuthMiddleware).toBe("function");
  });
});
