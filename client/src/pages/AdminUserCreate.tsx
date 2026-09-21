import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { createUser } from "../api";
import { EyeIcon } from "./ChangePassword.js";

// Issue #50 (Lab 3) — Create User (ui-spec §7.2): name, email, one role,
// activation state, and initial password with the shared eye-toggle
// pattern. Success never echoes the password.
export default function AdminUserCreate() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("REQUESTER");
  const [active, setActive] = useState(true);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFieldErrors({});
    setError("");
    setSaving(true);
    try {
      await createUser({ name: name.trim(), email: email.trim(), role, active, initialPassword: password });
      setPassword("");
      navigate("/admin/users");
    } catch (err: unknown) {
      const e = err as { body?: { error?: { message?: string }; fieldErrors?: Record<string, string> } };
      if (e.body?.fieldErrors) {
        setFieldErrors(e.body.fieldErrors);
      } else {
        setError(e.body?.error?.message ?? "Unable to create user. Please try again.");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="card lab3-admin-form-card">
      <div className="card-body">
        <h2 className="h4 mb-3">Create User</h2>
        <form onSubmit={(e) => void onSubmit(e)} noValidate>
        <div className="row g-2 mb-3">
          <div className="col-md-6">
            <label htmlFor="admin-create-name" className="form-label">
              Name <span className="required-marker" aria-hidden="true">*</span>
            </label>
            <input
              id="admin-create-name"
              className="form-control"
              value={name}
              onChange={(e) => setName(e.target.value)}
              aria-required="true"
            />
            {fieldErrors.name && <div className="invalid-feedback d-block">{fieldErrors.name}</div>}
          </div>
          <div className="col-md-6">
            <label htmlFor="admin-create-email" className="form-label">
              Email <span className="required-marker" aria-hidden="true">*</span>
            </label>
            <input
              id="admin-create-email"
              className="form-control"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-required="true"
            />
            {fieldErrors.email && <div className="invalid-feedback d-block">{fieldErrors.email}</div>}
          </div>
        </div>
        <div className="row g-2 mb-3">
          <div className="col-md-6">
            <label htmlFor="admin-create-role" className="form-label">
              Role <span className="required-marker" aria-hidden="true">*</span>
            </label>
            <select id="admin-create-role" className="form-select" value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="REQUESTER">REQUESTER</option>
              <option value="IT_STAFF">IT_STAFF</option>
              <option value="ADMINISTRATOR">ADMINISTRATOR</option>
            </select>
            {fieldErrors.role && <div className="invalid-feedback d-block">{fieldErrors.role}</div>}
          </div>
          <div className="col-md-6">
            <div className="form-check mt-4">
              <input
                id="admin-create-active"
                className="form-check-input"
                type="checkbox"
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
              />
              <label htmlFor="admin-create-active" className="form-check-label">
                Active
              </label>
            </div>
            {fieldErrors.active && <div className="invalid-feedback d-block">{fieldErrors.active}</div>}
          </div>
        </div>
        <div className="mb-2">
          <label htmlFor="admin-create-password" className="form-label">
            Initial Password <span className="required-marker" aria-hidden="true">*</span>
          </label>
          <div className="input-group">
            <input
              id="admin-create-password"
              className="form-control"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-required="true"
              autoComplete="new-password"
            />
            <button
              type="button"
              className="btn btn-outline-secondary"
              aria-label={showPassword ? "Hide initial password" : "Show initial password"}
              aria-pressed={showPassword}
              onClick={() => setShowPassword((v) => !v)}
            >
              <EyeIcon off={showPassword} />
            </button>
          </div>
          <div className="form-text">8–64 characters with uppercase, lowercase, and special character.</div>
          {fieldErrors.initialPassword && <div className="invalid-feedback d-block">{fieldErrors.initialPassword}</div>}
        </div>
        <p className="form-text">
          The user will be required to change this initial password at the next sign-in. The password is never
          displayed again after creation.
        </p>
        {error && (
          <div className="alert alert-danger" role="alert">
            {error}
          </div>
        )}
        <div className="d-flex gap-2 lab3-form-actions">
          <Link className="btn btn-outline-success" to="/admin/users">
            Cancel
          </Link>
          <button type="submit" className="btn btn-success" disabled={saving}>
            Create User
          </button>
        </div>
      </form>
      </div>
    </section>
  );
}
