import { useRef, useState } from "react";
import { createTicketAction, updateTicketAction, type ActionTaken, type EligibleOwner } from "../../../api.js";

function toInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function toISOString(input: string): string | null {
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export interface ActionFormProps {
  ticketId: number;
  owners: EligibleOwner[];
  initialAction?: ActionTaken | null;
  onSaved: (action: ActionTaken, replayed: boolean) => void;
  onCancel: () => void;
}

// Issue #78 — create/edit form. Create mode mints one clientRequestId per
// form instance (stable across busy-retries); edit mode sends the displayed
// expectedVersion. The work datetime is always explicit (auto-tick fills the
// input; the field is never omitted).
export function ActionForm({ ticketId, owners, initialAction, onSaved, onCancel }: ActionFormProps) {
  const editing = initialAction != null;
  const [description, setDescription] = useState(initialAction?.description ?? "");
  const [assignee, setAssignee] = useState(
    initialAction?.assignedTo ? String(initialAction.assignedTo.id) : "",
  );
  const [actionDate, setActionDate] = useState(
    initialAction ? toInputValue(new Date(initialAction.actionDate)) : "",
  );
  const [followUpRequired, setFollowUpRequired] = useState(initialAction?.followUpRequired ?? false);
  const [followUpNote, setFollowUpNote] = useState(initialAction?.followUpNote ?? "");
  const [attachmentNotes, setAttachmentNotes] = useState(initialAction?.attachmentNotes ?? "");
  const [result, setResult] = useState(initialAction?.result ?? "");
  const [fieldError, setFieldError] = useState("");
  const [serverError, setServerError] = useState("");
  const [busy, setBusy] = useState(false);
  const keyRef = useRef<string | null>(null);
  const submittingRef = useRef(false);
  if (keyRef.current === null) {
    keyRef.current = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
  }

  async function onSubmit() {
    // Synchronous ref guard: two clicks in the same tick must still yield
    // exactly one request (state updates are async and cannot guard this).
    // The guard engages only after validation passes, so failed validation
    // never wedges the form.
    if (submittingRef.current) return;
    if (description.trim() === "") {
      setFieldError("Description is required.");
      return;
    }
    if (actionDate.trim() === "") {
      setFieldError("Work date and time is required — use current time or pick a value.");
      return;
    }
    const instant = toISOString(actionDate);
    if (instant === null) {
      setFieldError("Work date and time is not a valid datetime.");
      return;
    }
    if (followUpRequired && followUpNote.trim() === "") {
      setFieldError("Follow-up note is required when follow-up is flagged.");
      return;
    }
    submittingRef.current = true;
    setFieldError("");
    setServerError("");
    setBusy(true);
    try {
      if (editing && initialAction) {
        const updated = await updateTicketAction(initialAction.id, {
          expectedVersion: initialAction.version,
          description: description.trim(),
          result: result.trim() === "" ? null : result.trim(),
          assignedToId: assignee === "" ? null : Number(assignee),
          actionDate: instant,
          followUpRequired,
          followUpNote: followUpRequired ? followUpNote.trim() : null,
          attachmentNotes: attachmentNotes.trim() === "" ? null : attachmentNotes.trim(),
        });
        onSaved(updated, false);
      } else {
        const { action, replayed } = await createTicketAction(ticketId, {
          description: description.trim(),
          clientRequestId: keyRef.current as string,
          assignedToId: assignee === "" ? null : Number(assignee),
          actionDate: instant,
          followUpRequired,
          followUpNote: followUpRequired ? followUpNote.trim() : null,
          attachmentNotes: attachmentNotes.trim() === "" ? null : attachmentNotes.trim(),
          result: result.trim() === "" ? null : result.trim(),
        });
        onSaved(action, replayed);
      }
    } catch (err: unknown) {
      const code = (err as { body?: { error?: { code?: string; message?: string } } }).body?.error?.code;
      const message = (err as { body?: { error?: { message?: string } } }).body?.error?.message;
      if (code === "ACTION_DATE_OUT_OF_RANGE" && message) {
        setServerError(message);
      } else {
        setServerError("Unable to record the action. Check your input and try again — your entries are preserved.");
      }
    } finally {
      submittingRef.current = false;
      setBusy(false);
    }
  }

  return (
    <form
      aria-label={editing ? "Edit action" : "Create action"}
      onSubmit={(e) => {
        e.preventDefault();
        void onSubmit();
      }}
      onKeyDown={(e) => {
        // Inline editing has no modal trap; Escape abandons the form and
        // returns focus via the parent onCancel path (ui-spec s.9).
        if (e.key === "Escape") {
          e.preventDefault();
          onCancel();
        }
      }}
    >
      {editing && initialAction && (
        <p className="form-text">
          Editing action #{initialAction.id} (version {initialAction.version})
        </p>
      )}
      <div className="mb-2">
        <label className="form-label" htmlFor="action-form-description">
          Description
        </label>
        <textarea
          id="action-form-description"
          className="form-control"
          rows={3}
          autoFocus
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>
      <div className="row g-2 mb-2">
        <div className="col-md-6">
          <label className="form-label" htmlFor="action-form-assignee">
            Assignee
          </label>
          <select
            id="action-form-assignee"
            className="form-select"
            value={assignee}
            onChange={(e) => setAssignee(e.target.value)}
          >
            <option value="">Unassigned (recorder accountable)</option>
            {owners.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </div>
        <div className="col-md-6">
          <label className="form-label" htmlFor="action-form-date">
            Work date and time
          </label>
          <input
            id="action-form-date"
            type="datetime-local"
            step={1}
            className="form-control"
            value={actionDate}
            onChange={(e) => setActionDate(e.target.value)}
          />
          <button type="button" className="btn btn-outline-success btn-sm mt-1" onClick={() => setActionDate(toInputValue(new Date()))}>
            Use current time
          </button>
        </div>
      </div>
      <div className="mb-2">
        <label className="form-label" htmlFor="action-form-result">
          Result (optional at creation)
        </label>
        <textarea id="action-form-result" className="form-control" rows={2} value={result} onChange={(e) => setResult(e.target.value)} />
      </div>
      <div className="form-check mb-2">
        <input
          id="action-form-followup"
          type="checkbox"
          className="form-check-input"
          checked={followUpRequired}
          onChange={(e) => setFollowUpRequired(e.target.checked)}
        />
        <label className="form-check-label" htmlFor="action-form-followup">
          Require follow-up
        </label>
      </div>
      {followUpRequired && (
        <div className="mb-2">
          <label className="form-label" htmlFor="action-form-followup-note">
            Follow-up note
          </label>
          <textarea
            id="action-form-followup-note"
            className="form-control"
            rows={2}
            value={followUpNote}
            onChange={(e) => setFollowUpNote(e.target.value)}
          />
        </div>
      )}
      <div className="mb-2">
        <label className="form-label" htmlFor="action-form-attachments">
          Attachment notes (optional)
        </label>
        <input
          id="action-form-attachments"
          className="form-control"
          value={attachmentNotes}
          onChange={(e) => setAttachmentNotes(e.target.value)}
        />
      </div>
      {fieldError && (
        <div className="alert alert-danger" role="alert">
          {fieldError}
        </div>
      )}
      {serverError && (
        <div className="alert alert-danger" role="alert">
          {serverError}
        </div>
      )}
      <div className="d-flex gap-2">
        <button type="submit" className="btn btn-success" disabled={busy}>
          {editing ? "Save changes" : "Create action"}
        </button>
        <button type="button" className="btn btn-outline-success" disabled={busy} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
