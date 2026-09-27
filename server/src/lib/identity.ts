// BR-46: trim + case-insensitive canonicalization; accounts cannot differ only by case.
export function canonicalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function emailsEqual(a: string, b: string): boolean {
  return canonicalizeEmail(a) === canonicalizeEmail(b);
}

// Issue #50 (BR-40): application email-format validator. Exactly one "@"
// with non-empty local and dotted-domain parts and no whitespace.
export function isEmailValid(email: string): boolean {
  if (typeof email !== "string") return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
