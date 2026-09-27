import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { listUsers, updateUser, ManagedUser } from "../api";

// Issue #50 (Lab 3) — Edit User (ui-spec §7.3/7.5): name/email/role/
// activation with atomic server validation. Safety conflicts surface the
// backend message actionably and preserve edit input for correction.
export default function AdminUserEdit() {
  const { id } = useParams<{ id: string }>();
  const userId = Number(id);
  const navigate = useNavigate();

  const [user, setUser] = useState<ManagedUser | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("REQUESTER");
  const [active, setActive] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [forbidden, setForbidden] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [actionError, setActionError] = useState("");
  const [actionOk, setActionOk] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    setForbidden(false);
    try {
      const res = await listUsers();
      const found = res.data.find((u) => u.id === userId) ?? null;
      if (!found) {
        setError("User not found.");
        setUser(null);
        return;
      }
      setUser(found);
      setName(found.name);
      setEmail(found.email);
      setRole(found.role);
      setActive(found.active);
    } catch (err: unknown) {
      const e = err as { status?: number; body?: { error?: { message?: string } } };
      if (e.status === 403) {
        setForbidden(true);
      } else {
        setError(e.body?.error?.message ?? "Unable to connect to TokTickIT API");
      }
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (!Number.isInteger(userId) || userId <= 0) {
      setLoading(false);
      setError("User not found.");
      return;
    }
    void load();
  }, [userId, load]);

  async function onSave() {
    if (!user) return;
    setSaving(true);
    setFieldErrors({});
    setActionError("");
    setActionOk("");
    try {
      const updated = await updateUser(userId, { name: name.trim(), email: email.trim(), role, active });
      setUser(updated);
      setName(updated.name);
      setEmail(updated.email);
      setRole(updated.role);
      setActive(updated.active);
      setActionOk("User updated.");
    } catch (err: unknown) {
      const e = err as { body?: { error?: { message?: string }; fieldErrors?: Record<string, string> } };
      if (e.body?.fieldErrors) {
        setFieldErrors(e.body.fieldErrors);
      } else {
        // Safety conflicts (self/last-admin/active-tickets) arrive here
        // with actionable copy; input is preserved, not wiped.
        setActionError(e.body?.error?.message ?? "Unable to update user. Please try again.");
      }
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="text-secondary">Loading user…</p>;
  if (forbidden) {
    return (
      <div className="alert alert-warning" role="alert">
        You do not have permission to manage users.
      </div>
    );
  }
  if (error || !user) {
    return (
      <div>
        <Link className="btn btn-outline-success btn-sm mb-3" to="/admin/users">
          Back to User Management
        </Link>
        <div className="alert alert-danger" role="alert">{error || "User not found."}</div>
      </div>
    );
  }

  return (
    <div>
      <nav aria-label="Breadcrumb">
        <ol className="breadcrumb">
          <li className="breadcrumb-item">
            <Link to="/admin/users">User Management</Link>
          </li>
          <li className="breadcrumb-item active" aria-current="page">
            Edit User
          </li>
        </ol>
      </nav>
      <section className="card lab3-admin-form-card">
        <div className="card-body">
          <h2 className="h4 mb-3">Edit User</h2>
      {actionError && (
        <div className="alert alert-danger" role="alert">
          {actionError}
        </div>
      )}
      {actionOk && (
        <div className="alert alert-success" role="status">
          {actionOk}
        </div>
      )}
      <div className="row g-2 mb-3">
        <div className="col-md-6">
          <label htmlFor="admin-edit-name" className="form-label">
            Name <span className="required-marker" aria-hidden="true">*</span>
          </label>
          <input id="admin-edit-name" className="form-control" value={name} onChange={(e) => setName(e.target.value)} />
          {fieldErrors.name && <div className="invalid-feedback d-block">{fieldErrors.name}</div>}
        </div>
        <div className="col-md-6">
          <label htmlFor="admin-edit-email" className="form-label">
            Email <span className="required-marker" aria-hidden="true">*</span>
          </label>
          <input id="admin-edit-email" className="form-control" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          {fieldErrors.email && <div className="invalid-feedback d-block">{fieldErrors.email}</div>}
        </div>
      </div>
      <div className="row g-2 mb-3">
        <div className="col-md-6">
          <label htmlFor="admin-edit-role" className="form-label">
            Role <span className="required-marker" aria-hidden="true">*</span>
          </label>
            <select id="admin-edit-role" className="form-select" value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="REQUESTER">REQUESTER</option>
              <option value="IT_STAFF">IT_STAFF</option>
              <option value="ADMINISTRATOR">ADMINISTRATOR</option>
            </select>
          {fieldErrors.role && <div className="invalid-feedback d-block">{fieldErrors.role}</div>}
        </div>
        <div className="col-md-6">
          <span className="form-label d-block">Account Status</span>
          <div className="form-check form-switch">
            <input
              id="admin-edit-active"
              className="form-check-input"
              type="checkbox"
              role="switch"
              aria-label="Active"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
            />
            <span className="form-check-label" aria-hidden="true">
              {active ? "Active" : "Inactive"}
            </span>
          </div>
          {fieldErrors.active && <div className="invalid-feedback d-block">{fieldErrors.active}</div>}
        </div>
      </div>
      <div className="lab3-admin-callout mb-3">
        <strong>Password</strong>
        <div className="small text-secondary mb-2">Password and security counters are not directly editable here.</div>
        <Link className="btn btn-outline-success" to={`/admin/users/${userId}/initial-password`}>
          Set New Initial Password
        </Link>
      </div>
      <div className="d-flex gap-2 lab3-form-actions">
        <button type="button" className="btn btn-outline-success" onClick={() => navigate("/admin/users")}>
          Cancel
        </button>
        <button type="button" className="btn btn-success" disabled={saving} onClick={() => void onSave()}>
          Save Changes
        </button>
      </div>
        </div>
      </section>
    </div>
  );
}
