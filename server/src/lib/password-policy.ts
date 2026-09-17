// Password policy (api-spec §1.3 / BR-08).
//
// Rules: 8–64 Unicode CODE POINTS ([...pw].length), requires at least one
// uppercase letter, one lowercase letter, and one special character
// (non-letter, non-number), and the new password must differ from the
// current one. Input is used exactly as given: no trim, no Unicode
// normalization, no truncation — leading/trailing spaces count as
// characters. Returns short error-code strings (no secrets in messages);
// an empty array means the password is valid.

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 64;

export function validateNewPassword(pw: string, currentPw: string): string[] {
  const errors: string[] = [];
  const length = [...pw].length;
  if (length < PASSWORD_MIN_LENGTH) errors.push("TOO_SHORT");
  if (length > PASSWORD_MAX_LENGTH) errors.push("TOO_LONG");
  if (!/\p{Lu}/u.test(pw)) errors.push("MISSING_UPPERCASE");
  if (!/\p{Ll}/u.test(pw)) errors.push("MISSING_LOWERCASE");
  if (!/[^\p{L}\p{N}]/u.test(pw)) errors.push("MISSING_SPECIAL");
  if (pw === currentPw) errors.push("SAME_AS_CURRENT");
  return errors;
}
