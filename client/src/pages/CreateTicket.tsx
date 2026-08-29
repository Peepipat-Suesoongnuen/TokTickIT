import { useEffect, useState } from "react";
import { fetchCategories, fetchRelatedSystems, createTicket, Category, RelatedSystem } from "../api";
import { useRequester } from "../contexts/RequesterContext";
import { trimValue, isSummaryValid, isDescriptionValid, ALLOWED_PRIORITIES } from "../lib/validation";

export default function CreateTicket() {
  const { requester } = useRequester();
  const [categories, setCategories] = useState<Category[]>([]);
  const [systems, setSystems] = useState<RelatedSystem[]>([]);
  const [refLoading, setRefLoading] = useState(true);
  const [refError, setRefError] = useState("");

  const [categoryId, setCategoryId] = useState("");
  const [relatedSystemId, setRelatedSystemId] = useState("");
  const [priority, setPriority] = useState("MEDIUM");
  const [summary, setSummary] = useState("");
  const [description, setDescription] = useState("");

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<{ ticketNumber: string } | null>(null);
  const [submitError, setSubmitError] = useState("");

  const loadRef = async () => {
    if (!requester) return;
    setRefLoading(true);
    setRefError("");
    try {
      const [cats, sys] = await Promise.all([fetchCategories(requester.id), fetchRelatedSystems(requester.id)]);
      setCategories(cats);
      setSystems(sys);
    } catch (err) {
      setRefError(err instanceof Error ? err.message : "Unable to load reference data");
    } finally {
      setRefLoading(false);
    }
  };

  useEffect(() => {
    loadRef();
  }, [requester?.id]);

  const validate = (): boolean => {
    const fe: Record<string, string> = {};
    if (!categoryId) fe.categoryId = "Please select a category.";
    if (!relatedSystemId) fe.relatedSystemId = "Please select a related system.";
    if (!isSummaryValid(summary)) fe.summary = "Summary must contain 5–120 characters.";
    if (!isDescriptionValid(description)) fe.description = "Description must contain 20–2,000 characters.";
    if (!ALLOWED_PRIORITIES.includes(priority as never)) fe.requestedPriority = "Please select a priority.";
    setFieldErrors(fe);
    if (Object.keys(fe).length > 0) {
      const first = document.querySelector<HTMLElement>("[data-field-error]");
      first?.focus();
    }
    return Object.keys(fe).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError("");
    setSuccess(null);
    if (!validate() || !requester) return;
    setSubmitting(true);
    try {
      const res = await createTicket({
        requesterId: requester.id,
        categoryId: Number(categoryId),
        relatedSystemId: Number(relatedSystemId),
        summary: trimValue(summary),
        description: trimValue(description),
        requestedPriority: priority,
      });
      setSuccess({ ticketNumber: res.ticketNumber });
    } catch (err: unknown) {
      const e = err as { status?: number; body?: { error?: { message?: string }; fieldErrors?: Record<string, string> } };
      if (e.body?.fieldErrors) setFieldErrors(e.body.fieldErrors);
      setSubmitError(e.body?.error?.message ?? "An unexpected error occurred. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!requester) return null;

  if (success) {
    return (
      <div className="alert alert-success" role="alert" style={{ backgroundColor: "#EAF6EF", borderColor: "#0B7A46", color: "#006B3C" }}>
        <h5 className="alert-heading">Ticket created successfully</h5>
        <p className="mb-2">
          Official Ticket Number: <strong>{success.ticketNumber}</strong>
        </p>
        <div className="d-flex gap-2">
          <a className="btn btn-success" href="/my-tickets">
            View My Tickets
          </a>
          <button className="btn btn-outline-success" onClick={() => { setSuccess(null); setSummary(""); setDescription(""); setCategoryId(""); setRelatedSystemId(""); }}>
            Create Another
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <h2 className="h4 mb-3">Create Ticket</h2>

      {/* Read-only panel */}
      <div className="card mb-3" style={{ backgroundColor: "#EEF3EF" }}>
        <div className="card-body row g-3">
          <div className="col-md-4">
            <label className="form-label fw-semibold small">Ticket Number</label>
            <input className="form-control" value="Generated after submission" readOnly style={{ backgroundColor: "#EEF3EF" }} />
          </div>
          <div className="col-md-4">
            <label className="form-label fw-semibold small">Ticket Date</label>
            <input className="form-control" value="—" readOnly style={{ backgroundColor: "#EEF3EF" }} />
          </div>
          <div className="col-md-4">
            <label className="form-label fw-semibold small">Requester</label>
            <input className="form-control" value={requester.name} readOnly style={{ backgroundColor: "#EEF3EF" }} />
          </div>
        </div>
      </div>

      {/* Reference data loading / failure */}
      {refLoading && <p className="text-secondary">Loading reference data…</p>}
      {refError && (
        <div className="alert alert-danger d-flex justify-content-between align-items-center">
          <span>{refError}</span>
          <button type="button" className="btn btn-outline-danger btn-sm" onClick={loadRef}>
            Retry
          </button>
        </div>
      )}

      {/* Classification */}
      <div className="row g-3 mb-3">
        <div className="col-md-4">
          <label htmlFor="category" className="form-label fw-semibold">
            Category <span className="text-danger">*</span>
          </label>
          <select
            id="category"
            className={`form-select ${fieldErrors.categoryId ? "is-invalid" : ""}`}
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            disabled={refLoading || !!refError}
            aria-required="true"
          >
            <option value="">-- Select --</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          {fieldErrors.categoryId && <div className="invalid-feedback d-block text-danger" data-field-error>{fieldErrors.categoryId}</div>}
        </div>
        <div className="col-md-4">
          <label htmlFor="relatedSystem" className="form-label fw-semibold">
            Related System <span className="text-danger">*</span>
          </label>
          <select
            id="relatedSystem"
            className={`form-select ${fieldErrors.relatedSystemId ? "is-invalid" : ""}`}
            value={relatedSystemId}
            onChange={(e) => setRelatedSystemId(e.target.value)}
            disabled={refLoading || !!refError}
            aria-required="true"
          >
            <option value="">-- Select --</option>
            {systems.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          {fieldErrors.relatedSystemId && <div className="invalid-feedback d-block text-danger" data-field-error>{fieldErrors.relatedSystemId}</div>}
        </div>
        <div className="col-md-4">
          <label htmlFor="priority" className="form-label fw-semibold">
            Requested Priority <span className="text-danger">*</span>
          </label>
          <select id="priority" className="form-select" value={priority} onChange={(e) => setPriority(e.target.value)}>
            {ALLOWED_PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          {fieldErrors.requestedPriority && <div className="invalid-feedback d-block text-danger">{fieldErrors.requestedPriority}</div>}
        </div>
      </div>

      {/* Summary / Description */}
      <div className="mb-3">
        <label htmlFor="summary" className="form-label fw-semibold">
          Summary <span className="text-danger">*</span>
        </label>
        <input
          id="summary"
          className={`form-control ${fieldErrors.summary ? "is-invalid" : ""}`}
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          maxLength={120}
          aria-required="true"
        />
        {fieldErrors.summary && <div className="invalid-feedback d-block text-danger">{fieldErrors.summary}</div>}
      </div>

      <div className="mb-3">
        <label htmlFor="description" className="form-label fw-semibold">
          Description <span className="text-danger">*</span>
        </label>
        <textarea
          id="description"
          className={`form-control ${fieldErrors.description ? "is-invalid" : ""}`}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={5}
          style={{ resize: "vertical" }}
          aria-required="true"
        />
        {fieldErrors.description && <div className="invalid-feedback d-block text-danger">{fieldErrors.description}</div>}
      </div>

      {/* Attachments placeholder */}
      <div className="mb-3">
        <label className="form-label fw-semibold">Attachments</label>
        <p className="text-secondary small mb-1">JPG, PNG, WEBP or PDF, up to 5 MB each, max 5 files</p>
        <input type="file" className="form-control" disabled accept=".jpg,.jpeg,.png,.webp,.pdf" />
        <small className="text-secondary">Attachment upload will be available after ticket creation. Invalid files will be shown with an error and not counted.</small>
      </div>

      {submitError && <div className="alert alert-danger" role="alert">{submitError}</div>}

      <div className="d-flex gap-2">
        <button type="submit" className="btn btn-success" disabled={submitting || refLoading || !!refError} style={{ backgroundColor: "#006B3C", borderColor: "#006B3C" }}>
          {submitting ? (
            <>
              <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Submitting…
            </>
          ) : (
            "Submit Ticket"
          )}
        </button>
        <button type="button" className="btn btn-outline-secondary" onClick={() => { setSummary(""); setDescription(""); setFieldErrors({}); }}>
          Clear
        </button>
      </div>
    </form>
  );
}
