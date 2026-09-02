import { useEffect, useState } from "react";
import { fetchCategories, fetchRelatedSystems, createTicket, uploadAttachment, Category, RelatedSystem } from "../api";
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
  const [success, setSuccess] = useState<{ ticketNumber: string; id: number } | null>(null);
  const [submitError, setSubmitError] = useState("");
  const [pendingFiles, setPendingFiles] = useState<Array<{ file: File; status: "valid" | "invalid"; reason?: string }>>([]);
  const [uploadResults, setUploadResults] = useState<Array<{ name: string; status: "success" | "failed"; reason?: string }>>([]);

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
    const firstError = Object.keys(fe)[0];
    if (firstError) {
      const fieldId: Record<string, string> = {
        categoryId: "category",
        relatedSystemId: "relatedSystem",
        requestedPriority: "priority",
        summary: "summary",
        description: "description",
      };
      document.getElementById(fieldId[firstError])?.focus();
    }
    return Object.keys(fe).length === 0;
  };

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    const next: Array<{ file: File; status: "valid" | "invalid"; reason?: string }> = [];
    for (const f of files) {
      const ext = "." + (f.name.split(".").pop() ?? "").toLowerCase();
      const allowedExts = [".jpg", ".jpeg", ".png", ".webp", ".pdf"];
      const allowedMimes = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
      if (!allowedExts.includes(ext) || !allowedMimes.includes(f.type)) {
        next.push({ file: f, status: "invalid", reason: "File type not allowed" });
      } else if (f.size > 5 * 1024 * 1024) {
        next.push({ file: f, status: "invalid", reason: "File too large. Max 5 MB" });
      } else {
        next.push({ file: f, status: "valid" });
      }
    }
    // max 5 active not counted for invalid
    const validCount = next.filter((x) => x.status === "valid").length + pendingFiles.filter((x) => x.status === "valid").length;
    if (validCount > 5) {
      setSubmitError("Maximum of 5 active attachments reached");
      return;
    }
    setPendingFiles((prev) => [...prev, ...next]);
    e.target.value = "";
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError("");
    setSuccess(null);
    setUploadResults([]);
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
      // BR-18: upload valid pending files, keep ticket even if some fail
      const results: Array<{ name: string; status: "success" | "failed"; reason?: string }> = [];
      for (const pf of pendingFiles.filter((p) => p.status === "valid")) {
        try {
          await uploadAttachment(res.id, requester.id, pf.file);
          results.push({ name: pf.file.name, status: "success" });
        } catch (err: unknown) {
          const e = err as { body?: { error?: { message?: string } } };
          results.push({ name: pf.file.name, status: "failed", reason: e.body?.error?.message ?? "Upload failed" });
        }
      }
      if (results.length) setUploadResults(results);
      setSuccess({ ticketNumber: res.ticketNumber, id: res.id });
      if (results.every((r) => r.status === "success")) setPendingFiles([]);
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
      <div className="alert alert-success" role="status" aria-live="polite" style={{ backgroundColor: "#EAF6EF", borderColor: "#0B7A46", color: "#006B3C" }}>
        <h5 className="alert-heading"><span className="lab2-success-icon" aria-hidden="true">✓</span>Ticket created successfully</h5>
        <p className="mb-2">
          Official Ticket Number: <strong>{success.ticketNumber}</strong>
        </p>
        {uploadResults.length > 0 ? (
          <ul className="list-group mb-2">
            {uploadResults.map((r, i) => (
              <li key={i} className={`list-group-item ${r.status === "failed" ? "text-danger" : "text-success"}`}>
                {r.name} — {r.status} {r.reason ? `(${r.reason})` : ""}
                {r.status === "failed" ? <a href={`/tickets/${success.id}`} className="ms-2">Retry from Ticket Detail</a> : null}
              </li>
            ))}
          </ul>
        ) : null}
        <div className="d-flex gap-2 lab2-mobile-stack">
          <a className="btn btn-success btn-zen-primary" href="/my-tickets">
            View My Tickets
          </a>
          <a className="btn btn-outline-success" href={`/tickets/${success.id}`}>
            View Ticket Detail
          </a>
          <button className="btn btn-outline-success" onClick={() => { setSuccess(null); setSummary(""); setDescription(""); setCategoryId(""); setRelatedSystemId(""); setPendingFiles([]); setUploadResults([]); }}>
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
      <div className="card mb-3 lab2-surface">
        <div className="card-body row g-3">
          <div className="col-md-6 col-lg-4">
            <label className="form-label fw-semibold small">Ticket Number</label>
            <input className="form-control form-readonly" value="Generated after submission" readOnly aria-label="Ticket Number" />
          </div>
          <div className="col-md-6 col-lg-4">
            <label className="form-label fw-semibold small">Ticket Date</label>
            <input className="form-control form-readonly" value="—" readOnly aria-label="Ticket Date" />
          </div>
          <div className="col-md-6 col-lg-4">
            <label className="form-label fw-semibold small">Requester</label>
            <input className="form-control form-readonly" value={requester.name} readOnly aria-label="Requester" />
          </div>
        </div>
      </div>

      {/* Reference data loading / failure */}
      {refLoading && <p className="text-secondary">Loading reference data…</p>}
      {refError && (
        <div className="alert alert-danger d-flex justify-content-between align-items-center" role="alert" aria-live="polite">
          <span>{refError}</span>
          <button type="button" className="btn btn-outline-success btn-sm" onClick={loadRef}>
            Retry
          </button>
        </div>
      )}

      {/* Classification */}
      <div className="row g-3 mb-3">
        <div className="col-md-6 col-lg-4">
          <label htmlFor="category" className="form-label fw-semibold">
            Category <span className="text-danger required-marker">*</span>
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
        <div className="col-md-6 col-lg-4">
          <label htmlFor="relatedSystem" className="form-label fw-semibold">
            Related System <span className="text-danger required-marker">*</span>
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
        <div className="col-md-6 col-lg-4">
          <label htmlFor="priority" className="form-label fw-semibold">
            Requested Priority <span className="text-danger required-marker">*</span>
          </label>
          <select id="priority" className="form-select" value={priority} onChange={(e) => setPriority(e.target.value)} aria-required="true">
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
          Summary <span className="text-danger required-marker">*</span>
        </label>
        <input
          id="summary"
          className={`form-control ${fieldErrors.summary ? "is-invalid" : ""}`}
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          maxLength={120}
          aria-required="true"
        />
        <div className="form-text">5–120 characters</div>
        {fieldErrors.summary && <div className="invalid-feedback d-block text-danger">{fieldErrors.summary}</div>}
      </div>

      <div className="mb-3">
        <label htmlFor="description" className="form-label fw-semibold">
          Description <span className="text-danger required-marker">*</span>
        </label>
        <textarea
          id="description"
          className={`form-control lab2-description ${fieldErrors.description ? "is-invalid" : ""}`}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={5}
          aria-required="true"
        />
        <div className="form-text">20–2,000 characters</div>
        {fieldErrors.description && <div className="invalid-feedback d-block text-danger">{fieldErrors.description}</div>}
      </div>

      {/* Attachments */}
      <div className="mb-3">
        <label className="form-label fw-semibold">Attachments</label>
        <p className="text-secondary small mb-1">JPG, PNG, WEBP or PDF, up to 5 MB each, max 5 files</p>
        <input type="file" className="form-control" multiple onChange={handleFileSelect} accept=".jpg,.jpeg,.png,.webp,.pdf" aria-label="Choose files" />
        {pendingFiles.length > 0 ? (
          <ul className="list-group mt-2">
            {pendingFiles.map((pf, idx) => (
              <li key={idx} className={`list-group-item d-flex justify-content-between align-items-center lab2-attachment-row ${pf.status === "invalid" ? "text-danger" : ""}`}>
                <span className="lab2-attachment-name">{pf.file.name} {pf.status === "invalid" ? `— ${pf.reason}` : `— ${(pf.file.size / 1024).toFixed(1)} KB`}</span>
                <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => setPendingFiles((prev) => prev.filter((_, i) => i !== idx))}>
                  Dismiss
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        {pendingFiles.filter((p) => p.status === "valid").length >= 5 ? <small className="text-warning">Maximum of 5 active attachments reached</small> : null}
      </div>

      {submitError && <div className="alert alert-danger" role="alert" aria-live="polite">{submitError}</div>}

      <div className="d-flex gap-2 lab2-mobile-stack">
        <button type="submit" className="btn btn-success btn-zen-primary" disabled={submitting || refLoading || !!refError}>
          {submitting ? (
            <>
              <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Submitting…
            </>
          ) : (
            "Submit Ticket"
          )}
        </button>
        <button type="button" className="btn btn-outline-success" onClick={() => { setSummary(""); setDescription(""); setFieldErrors({}); }}>
          Clear
        </button>
      </div>
    </form>
  );
}
