import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { changePassword as apiChangePassword, type SafeUser } from "../api.js";
import { useAuth } from "../contexts/AuthContext.js";

// Checklist copy per ui-spec §3.2, rendered BELOW Confirm New Password. Each
// rule flips from an unmet bullet to a check as the typed New Password
// satisfies it. Mirrors the server policy (password-policy.ts): 8–64 Unicode
// code points, upper + lower + special (non-letter, non-number), and differs
// from current. No trim/normalization — spaces count, matching the server.
const RULES = [
  { id: "length", text: "8–64 characters" },
  { id: "upper", text: "at least one uppercase letter" },
  { id: "lower", text: "at least one lowercase letter" },
  { id: "special", text: "at least one special character" },
  { id: "differs", text: "differs from the current password" },
] as const;

function ruleMet(id: string, current: string, next: string): boolean {
  switch (id) {
    case "length": {
      const n = [...next].length;
      return n >= 8 && n <= 64;
    }
    case "upper":
      return /\p{Lu}/u.test(next);
    case "lower":
      return /\p{Ll}/u.test(next);
    case "special":
      return /[^\p{L}\p{N}]/u.test(next);
    case "differs":
      return next.length > 0 && next !== current;
    default:
      return false;
  }
}

export default function ChangePassword({ onChanged }: { onChanged?: (user: SafeUser) => void }) {
  const { logout, refresh } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const met = useMemo(
    () =>
      Object.fromEntries(RULES.map((r) => [r.id, ruleMet(r.id, currentPassword, newPassword)])) as Record<
        string,
        boolean
      >,
    [currentPassword, newPassword],
  );

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (currentPassword.length === 0) next.currentPassword = "Current password is required.";
    if (newPassword.length === 0) next.newPassword = "New password is required.";
    if (confirmPassword.length === 0) {
      next.confirmPassword = "Please confirm the new password.";
    } else if (newPassword !== confirmPassword) {
      // UI-only confirmation: blocked client-side and never sent (api-spec §3.4).
      next.confirmPassword = "Passwords do not match.";
    }
    setErrors(next);
    if (Object.keys(next).length > 0) {
      const first = next.currentPassword ? "cp-current" : next.newPassword ? "cp-new" : "cp-confirm";
      document.getElementById(first)?.focus();
      return;
    }
    setBusy(true);
    try {
      const { user } = await apiChangePassword(currentPassword, newPassword);
      await refresh();
      onChanged?.(user);
    } catch (err) {
      const e = err as {
        body?: { error?: { message?: string }; fieldErrors?: Record<string, string> } | null;
      };
      const fieldErrors = e?.body?.fieldErrors ?? {};
      if (Object.keys(fieldErrors).length > 0) {
        setErrors({ ...fieldErrors });
      } else {
        setErrors({ form: e?.body?.error?.message ?? "Unable to change password. Please try again." });
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="container py-4" style={{ maxWidth: 480 }}>
      <div className="card p-4">
        <h1 className="h4">Change Password</h1>
        <form onSubmit={onSubmit} noValidate>
          <div className="mb-3">
            <label htmlFor="cp-current" className="form-label">
              Current Password
            </label>
            <div className="input-group">
              <input
                id="cp-current"
                type={showCurrent ? "text" : "password"}
                autoComplete="current-password"
                className="form-control"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
              />
              <button
                type="button"
                className="btn btn-outline-secondary"
                aria-label={showCurrent ? "Hide current password" : "Show current password"}
                onClick={() => setShowCurrent((s) => !s)}
              >
                <span aria-hidden="true">👁</span>
              </button>
            </div>
            {errors.currentPassword && (
              <div className="invalid-feedback d-block">{errors.currentPassword}</div>
            )}
          </div>
          <div className="mb-3">
            <label htmlFor="cp-new" className="form-label">
              New Password
            </label>
            <div className="input-group">
              <input
                id="cp-new"
                type={showNew ? "text" : "password"}
                autoComplete="new-password"
                className="form-control"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
              <button
                type="button"
                className="btn btn-outline-secondary"
                aria-label={showNew ? "Hide new password" : "Show new password"}
                onClick={() => setShowNew((s) => !s)}
              >
                <span aria-hidden="true">👁</span>
              </button>
            </div>
            {errors.newPassword && <div className="invalid-feedback d-block">{errors.newPassword}</div>}
          </div>
          <div className="mb-3">
            <label htmlFor="cp-confirm" className="form-label">
              Confirm New Password
            </label>
            <div className="input-group">
              <input
                id="cp-confirm"
                type={showConfirm ? "text" : "password"}
                autoComplete="new-password"
                className="form-control"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
              <button
                type="button"
                className="btn btn-outline-secondary"
                aria-label={showConfirm ? "Hide confirm password" : "Show confirm password"}
                onClick={() => setShowConfirm((s) => !s)}
              >
                <span aria-hidden="true">👁</span>
              </button>
            </div>
            {errors.confirmPassword && (
              <div className="invalid-feedback d-block">{errors.confirmPassword}</div>
            )}
            <p className="form-text mt-2 mb-1">Password requirements:</p>
            <ul aria-label="Password requirements" className="list-unstyled small">
              {RULES.map((r) => (
                <li key={r.id}>
                  <span aria-hidden="true">{met[r.id] ? "✓" : "•"}</span> {r.text}
                </li>
              ))}
            </ul>
          </div>
          {errors.form && (
            <div role="alert" className="alert alert-danger">
              {errors.form}
            </div>
          )}
          <div className="row g-2">
            <div className="col-6">
              <button type="submit" className="btn btn-success w-100" disabled={busy}>
                {busy ? "Changing…" : "Change Password"}
              </button>
            </div>
            <div className="col-6">
              <button type="button" className="btn btn-outline-secondary w-100" onClick={() => void logout()}>
                Logout
              </button>
            </div>
          </div>
        </form>
      </div>
    </main>
  );
}
