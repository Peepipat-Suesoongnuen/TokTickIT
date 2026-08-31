import { useState } from "react";

export interface Attachment {
  id: number;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  removedAt: string | null;
  removedReason: string | null;
  createdAt: string;
}

export function formatBangkok(iso: string): string {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Bangkok",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).formatToParts(d);
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
    return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}:${get("second")}`;
  } catch {
    return iso;
  }
}

export default function AttachmentSection({
  attachments,
  onDownload,
  onRemove,
  onRetry,
  onUpload,
  canUpload,
}: {
  attachments: Attachment[];
  onDownload: (id: number) => void;
  onRemove: (id: number, reason: string) => void;
  onRetry?: () => void;
  onUpload: (file: File) => void;
  canUpload: boolean;
}) {
  const [removingId, setRemovingId] = useState<number | null>(null);
  const [reason, setReason] = useState("");

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      onUpload(file);
      e.target.value = "";
    }
  }

  return (
    <div className="card">
      <div className="card-body">
        <h2 className="h6">Attachments</h2>
        {canUpload ? (
          <div className="mb-3">
            <input type="file" accept=".jpg,.jpeg,.png,.webp,.pdf" onChange={handleFileChange} aria-label="Choose file" />
            <div className="form-text">JPG, PNG, WEBP or PDF, up to 5 MB each, max 5 files</div>
          </div>
        ) : (
          <p className="text-secondary small">Maximum of 5 active attachments reached</p>
        )}
        {attachments.length === 0 ? (
          <p className="text-secondary">No attachments yet</p>
        ) : (
          <ul className="list-group">
            {attachments.map((a) => {
              const isRemoved = !!a.removedAt;
              return (
                <li key={a.id} className={`list-group-item d-flex justify-content-between align-items-center ${isRemoved ? "text-muted" : ""}`}>
                  <div>
                    <span style={isRemoved ? { textDecoration: "line-through" } : undefined}>{a.originalFilename}</span>
                    <span className="text-secondary small ms-2">{(a.sizeBytes / 1024).toFixed(1)} KB</span>
                    {isRemoved ? (
                      <span className="ms-2 small">Removed {a.removedAt ? formatBangkok(a.removedAt) : ""} — Reason: {a.removedReason}</span>
                    ) : null}
                  </div>
                  <div className="d-flex gap-2">
                    {!isRemoved ? (
                      <>
                        <button className="btn btn-sm btn-outline-success" onClick={() => onDownload(a.id)}>
                          Download
                        </button>
                        <button className="btn btn-sm btn-outline-danger" onClick={() => setRemovingId(a.id)}>
                          Remove
                        </button>
                      </>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {onRetry ? (
          <button className="btn btn-sm btn-outline-secondary mt-2" onClick={onRetry}>
            Retry
          </button>
        ) : null}
        {removingId !== null ? (
          <div className="modal d-block" tabIndex={-1} role="dialog" aria-label="Remove Attachment">
            <div className="modal-dialog">
              <div className="modal-content">
                <div className="modal-header">
                  <h5 className="modal-title">Remove Attachment?</h5>
                </div>
                <div className="modal-body">
                  <p>Filename: {attachments.find((a) => a.id === removingId)?.originalFilename}</p>
                  <label htmlFor="removeReason" className="form-label">
                    Reason <span className="text-danger">*</span>
                  </label>
                  <textarea id="removeReason" className="form-control" value={reason} onChange={(e) => setReason(e.target.value)} aria-label="Reason" />
                </div>
                <div className="modal-footer">
                  <button className="btn btn-secondary" onClick={() => { setRemovingId(null); setReason(""); }}>
                    Cancel
                  </button>
                  <button className="btn btn-danger" disabled={!reason.trim()} onClick={() => { onRemove(removingId, reason.trim()); setRemovingId(null); setReason(""); }}>
                    Confirm Removal
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
