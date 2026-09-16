// BR-46: trim + case-insensitive canonicalization; accounts cannot differ only by case.
export function canonicalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function emailsEqual(a: string, b: string): boolean {
  return canonicalizeEmail(a) === canonicalizeEmail(b);
}
