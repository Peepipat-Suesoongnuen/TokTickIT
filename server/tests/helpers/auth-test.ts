// Test-only auth helper (Issue #46, Lab 3): log a fixture User in through the
// real login route and return the session cookie for authenticated requests.
//
// Single responsibility: this module only bridges supertest requests to the
// session identity established in Task 1 (`authorization-requester.api.test.ts`
// pattern — `hashPassword` fixture → POST /api/auth/login with an approved
// Origin → session cookie). Fixture creation stays in each test file.
import request from "supertest";
import { app } from "../../src/app.js";
import { SESSION_COOKIE_NAME } from "../../src/auth.js";

// Approved Origin accepted by the login route (mirrors the Task 1 cutover test).
export const TEST_ORIGIN = "http://localhost:5174";

export function sessionCookieValue(setCookie: unknown): string | undefined {
  const cookies: string[] = Array.isArray(setCookie)
    ? (setCookie as string[])
    : setCookie
      ? [setCookie as string]
      : [];
  const found = cookies.find((c) => c.startsWith(`${SESSION_COOKIE_NAME}=`));
  if (!found) return undefined;
  return found.split(";")[0];
}

// Log in as an existing active User (created with a `hashPassword` hash of
// `password`) and return the `Cookie` header value for subsequent requests.
export async function loginAs(email: string, password: string): Promise<string> {
  const res = await request(app)
    .post("/api/auth/login")
    .set("Origin", TEST_ORIGIN)
    .send({ email, password })
    .expect(200);
  const cookie = sessionCookieValue(res.headers["set-cookie"]);
  if (!cookie) throw new Error(`loginAs: no session cookie for ${email}`);
  return cookie;
}
