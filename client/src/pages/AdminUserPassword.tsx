import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useParams } from "react-router-dom";
import { listUsers, setInitialPassword } from "../api";
import { EyeIcon } from "./ChangePassword.js";

// Issue #50 (Lab 3) — Set New Initial Password (ui-spec §7.4): policy
// password + UI-only confirmation with eye toggles. On success the target
// must change it at next sign-in; nothing secret is echoed.
export default function AdminUserPassword() {
  const { id } = useParams<{ id: string }>();
  const userId = Number(id);
  const [userName, setUserName] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showNext, setShowNext] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [saving, setSaving] = useState(false);

  const mismatch = confirm !== "" && next !== confirm;

  useEffect(() => {
    if (!Number.isInteger(userId) || userId <= 0) return;
    listUsers()
      .then((res) => {
        const found = res.data.find((u) => u.id === userId);
        if (found) setUserName(`${found.name} · ${found.email}`);
      })
      .catch(() => undefined);
  }, [userId]);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (mismatch || next === "") return;
    setError("");
    setSaving(true);
    try {
      await setInitialPassword(userId, next);
      setNext("");
      setConfirm("");
      setDone(true);
    } catch (err: unknown) {
      const e = err as { body?: { error?: { message?: string }; fieldErrors?: Record<string, string> } };
      setError(
        e.body?.fieldErrors?.initialPassword ??
          e.body?.error?.message ??
          "Unable to set the initial password. Please try again.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <nav aria-label="Breadcrumb">
        <ol className="breadcrumb">
          <li className="breadcrumb-item">
            <Link to="/admin/users">User Management</Link>
          </li>
          <li className="breadcrumb-item">
            <Link to={`/admin/users/${userId}`}>{userName ? userName.split(" · ")[0] : "Edit User"}</Link>
          </li>
          <li className="breadcrumb-item active" aria-current="page">
            Set New Initial Password
          </li>
        </ol>
      </nav>
      <section className="card lab3-admin-form-card">
        <div className="card-body">
          <h2 className="h4 mb-2">Set New Initial Password</h2>
          {userName && <p className="text-secondary">{userName}</p>}
      {done && (
        <div className="alert alert-success" role="status">
          Initial password updated. The user must change it at next sign-in.
        </div>
      )}
      <form onSubmit={(e) => void onSubmit(e)} noValidate>
        <div className="mb-3">
          <label htmlFor="admin-reset-next" className="form-label">
            New Initial Password <span className="required-marker" aria-hidden="true">*</span>
          </label>
          <div className="input-group">
            <input
              id="admin-reset-next"
              className="form-control"
              type={showNext ? "text" : "password"}
              value={next}
              onChange={(e) => setNext(e.target.value)}
              aria-required="true"
              autoComplete="new-password"
            />
            <button
              type="button"
              className="btn btn-outline-secondary"
              aria-label={showNext ? "Hide new initial password" : "Show new initial password"}
              aria-pressed={showNext}
              onClick={() => setShowNext((v) => !v)}
            >
              <EyeIcon off={showNext} />
            </button>
          </div>
        </div>
        <div className="mb-3">
          <label htmlFor="admin-reset-confirm" className="form-label">
            Confirm Password <span className="required-marker" aria-hidden="true">*</span>
          </label>
          <div className="input-group">
            <input
              id="admin-reset-confirm"
              className="form-control"
              type={showConfirm ? "text" : "password"}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              aria-required="true"
              autoComplete="new-password"
            />
            <button
              type="button"
              className="btn btn-outline-secondary"
              aria-label={showConfirm ? "Hide confirm password" : "Show confirm password"}
              aria-pressed={showConfirm}
              onClick={() => setShowConfirm((v) => !v)}
            >
              <EyeIcon off={showConfirm} />
            </button>
          </div>
          {mismatch && <div className="invalid-feedback d-block">Passwords do not match.</div>}
          <ul className="password-checklist list-unstyled text-secondary small mt-2 mb-0">
            <li>8–64 characters</li>
            <li>At least one uppercase letter</li>
            <li>At least one lowercase letter</li>
            <li>At least one special character</li>
          </ul>
        </div>
        <div className="lab3-admin-danger-callout small mb-3">
          On success, the user&#39;s existing sessions are invalidated and the user must change this password at the next sign-in.
        </div>
        {error && (
          <div className="alert alert-danger" role="alert">
            {error}
          </div>
        )}
        <div className="d-flex gap-2 lab3-form-actions">
          <Link className="btn btn-outline-success" to={`/admin/users/${userId}`}>
            Cancel
          </Link>
          <button type="submit" className="btn btn-success" disabled={saving || mismatch || next === ""}>
            Set Password
          </button>
        </div>
      </form>
        </div>
      </section>
    </div>
  );
}
