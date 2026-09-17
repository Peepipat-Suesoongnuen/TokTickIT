import { createHash, randomBytes } from "node:crypto";

// Session-token helpers (api-spec §1.2): server-side opaque session with an
// absolute 8h lifetime and no sliding extension.
//
// createSessionToken generates ≥32 cryptographically random bytes for the
// opaque token and returns its SHA-256 hex digest for storage — the raw
// token itself is never persisted.

export const SESSION_TOKEN_BYTES = 32;

export function createSessionToken(): { token: string; tokenHash: string } {
  const token = randomBytes(SESSION_TOKEN_BYTES).toString("hex");
  const tokenHash = createHash("sha256").update(token, "utf8").digest("hex");
  return { token, tokenHash };
}

// Absolute expiry: expired iff now >= expiresAt (expired at exactly 8h).
export function isSessionExpired(expiresAt: Date, now: Date): boolean {
  return now.getTime() >= expiresAt.getTime();
}
