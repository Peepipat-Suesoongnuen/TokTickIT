import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  getStaffTicketDetail,
  listEligibleOwners,
  claimStaffTicket,
  assignStaffTicketOwner,
  setStaffTicketPriority,
  setStaffTicketStatus,
  downloadAttachment,
  listTicketComments,
  postTicketComment,
  listTicketNotes,
  postTicketNote,
  StaffTicketDetail as StaffTicketDetailData,
  EligibleOwner,
  TicketComment,
  TicketNote,
} from "../api";
import { PriorityBadge, StatusBadge } from "../components/Badges.js";
import { MessageTimeline, MessageComposer } from "../components/Communication.js";
import { formatBangkok } from "./MyTickets.js";

// Client-side offer list mirrors the approved matrix (specification §5);
// the backend remains the enforcement authority.
const NEXT_TRANSITIONS: Record<string, string[]> = {
  NEW: [],
  OPEN: ["IN_PROGRESS", "CANCELLED"],
  IN_PROGRESS: ["WAITING_FOR_REQUESTER", "RESOLVED", "CANCELLED"],
  WAITING_FOR_REQUESTER: ["IN_PROGRESS", "RESOLVED", "CANCELLED"],
  RESOLVED: ["CLOSED", "REOPENED"],
  CLOSED: ["REOPENED"],
  REOPENED: ["IN_PROGRESS", "CANCELLED"],
  CANCELLED: [],
};

const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

type Tab = "comments" | "notes" | "attachments" | "actions";

export default function StaffTicketDetail() {
  const { id } = useParams<{ id: string }>();
  const ticketId = Number(id);

  const [ticket, setTicket] = useState<StaffTicketDetailData | null>(null);
  const [owners, setOwners] = useState<EligibleOwner[]>([]);
  const [comments, setComments] = useState<TicketComment[]>([]);
  const [notes, setNotes] = useState<TicketNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [forbidden, setForbidden] = useState(false);
  const [tab, setTab] = useState<Tab>("actions");

  const [ownerDraft, setOwnerDraft] = useState("");
  const [priorityDraft, setPriorityDraft] = useState("");
  const [statusDraft, setStatusDraft] = useState("");
  const [reopenOwnerDraft, setReopenOwnerDraft] = useState("");
  const [actionError, setActionError] = useState("");
  const [actionOk, setActionOk] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    setForbidden(false);
    setActionError("");
    setActionOk("");
    try {
      const [detail, ownerList] = await Promise.all([
        getStaffTicketDetail(ticketId),
        listEligibleOwners().catch(() => ({ data: [] as EligibleOwner[] })),
      ]);
      setTicket(detail);
      setOwners(ownerList.data);
      // Communication timelines load best-effort alongside the ticket;
      // a failure here never blocks the operational workflow.
      const [commentList, noteList] = await Promise.all([
        listTicketComments(ticketId).catch(() => ({ data: [] as TicketComment[] })),
        listTicketNotes(ticketId).catch(() => ({ data: [] as TicketNote[] })),
      ]);
      setComments(commentList.data);
      setNotes(noteList.data);
      setOwnerDraft(detail.ticketOwner ? String(detail.ticketOwner.id) : "");
      setPriorityDraft(detail.itPriority);
      setStatusDraft("");
      setReopenOwnerDraft("");
    } catch (err: unknown) {
      const e = err as { status?: number; body?: { error?: { message?: string } } };
      if (e.status === 403) {
        setForbidden(true);
      } else if (e.status === 404) {
        setError("Ticket not found.");
      } else {
        setError(e.body?.error?.message ?? "Unable to connect to TokTickIT API");
      }
    } finally {
      setLoading(false);
    }
  }, [ticketId]);

  useEffect(() => {
    if (!Number.isInteger(ticketId) || ticketId <= 0) {
      setLoading(false);
      setError("Ticket not found.");
      return;
    }
    void load();
  }, [ticketId, load]);

  function failureOf(err: unknown): string {
    const e = err as { body?: { error?: { code?: string; message?: string } } };
    return e.body?.error?.message ?? "Unable to connect to TokTickIT API";
  }

  async function onClaim() {
    setSaving(true);
    setActionError("");
    setActionOk("");
    try {
      await claimStaffTicket(ticketId);
      await load();
      setActionOk("Ticket claimed.");
    } catch (err: unknown) {
      setActionError(failureOf(err));
    } finally {
      setSaving(false);
    }
  }

  async function onSaveOwner() {
    if (!ticket || ownerDraft === "") return;
    setSaving(true);
    setActionError("");
    setActionOk("");
    try {
      await assignStaffTicketOwner(ticketId, Number(ownerDraft), ticket.ticketOwner ? ticket.ticketOwner.id : null);
      await load();
      setActionOk("Ticket owner updated.");
    } catch (err: unknown) {
      setActionError(failureOf(err));
    } finally {
      setSaving(false);
    }
  }

  async function onSavePriority() {
    if (!ticket || priorityDraft === "") return;
    setSaving(true);
    setActionError("");
    setActionOk("");
    try {
      await setStaffTicketPriority(ticketId, priorityDraft, ticket.itPriority);
      await load();
      setActionOk("IT Priority updated.");
    } catch (err: unknown) {
      setActionError(failureOf(err));
    } finally {
      setSaving(false);
    }
  }

  async function onSaveStatus() {
    if (!ticket || statusDraft === "") return;
    if ((statusDraft === "CLOSED" || statusDraft === "CANCELLED") &&
      !window.confirm(`Change status to ${statusDraft}? This action requires confirmation.`)) {
      return;
    }
    setSaving(true);
    setActionError("");
    setActionOk("");
    try {
      await setStaffTicketStatus(
        ticketId,
        statusDraft,
        ticket.currentStatus,
        ticket.currentStatus === "CLOSED" && statusDraft === "REOPENED" && reopenOwnerDraft !== ""
          ? Number(reopenOwnerDraft)
          : undefined,
      );
      await load();
      setActionOk("Status updated.");
    } catch (err: unknown) {
      const e = err as { body?: { error?: { code?: string } } };
      if (e.body?.error?.code === "VALIDATION_FAILED" && statusDraft === "REOPENED") {
        setActionError("A replacement owner is required because the historical owner is no longer eligible.");
      } else {
        setActionError(failureOf(err));
      }
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="text-secondary">Loading ticket…</p>;
  if (forbidden) {
    return (
      <div className="alert alert-warning" role="alert">
        You do not have permission to view this ticket.
      </div>
    );
  }
  if (error || !ticket) {
    return (
      <div>
        <Link className="btn btn-outline-success btn-sm mb-3" to="/staff/queue">
          Back to Ticket Queue
        </Link>
        <div className="alert alert-danger" role="alert">{error || "Ticket not found."}</div>
      </div>
    );
  }

  const nextOptions = NEXT_TRANSITIONS[ticket.currentStatus] ?? [];
  const canClaim = ticket.ticketOwner === null && ticket.currentStatus === "NEW";
  const terminalLocked = ticket.currentStatus === "CLOSED" || ticket.currentStatus === "CANCELLED";
  const indication = ticket.requesterResolutionIndicatedAt ? "Problem appears resolved" : "—";

  return (
    <div>
      <nav aria-label="Breadcrumb">
        <ol className="breadcrumb">
          <li className="breadcrumb-item">
            <Link to="/staff/queue">Ticket Queue</Link>
          </li>
          <li className="breadcrumb-item active" aria-current="page">
            Ticket Detail
          </li>
        </ol>
      </nav>
      <div className="screen-heading d-flex justify-content-between align-items-center mb-3">
        <h2 className="h4 mb-0">Ticket {ticket.ticketNumber}</h2>
        <Link className="btn btn-outline-success btn-sm" to="/staff/queue">
          Back to Ticket Queue
        </Link>
      </div>

      <section className="card mb-3 p-3" aria-label="Ticket information">
        <div className="row g-2 mb-2">
          <div className="col-md-4">
            <label className="form-label lab2-toolbar-label" htmlFor="staff-info-number">Ticket Number</label>
            <input id="staff-info-number" className="form-control" readOnly value={ticket.ticketNumber} />
          </div>
          <div className="col-md-4">
            <label className="form-label lab2-toolbar-label" htmlFor="staff-info-date">Ticket Date</label>
            <input id="staff-info-date" className="form-control" readOnly value={formatBangkok(ticket.ticketDate)} />
          </div>
          <div className="col-md-4">
            <label className="form-label lab2-toolbar-label" htmlFor="staff-info-requester">Requester</label>
            <input
              id="staff-info-requester"
              className="form-control"
              readOnly
              value={`${ticket.requester.name} (${ticket.requester.email})`}
            />
          </div>
        </div>
        <div className="row g-2 mb-2">
          <div className="col-md-6">
            <label className="form-label lab2-toolbar-label" htmlFor="staff-info-category">Category</label>
            <input id="staff-info-category" className="form-control" readOnly value={ticket.category.name} />
          </div>
          <div className="col-md-6">
            <label className="form-label lab2-toolbar-label" htmlFor="staff-info-system">Related System</label>
            <input id="staff-info-system" className="form-control" readOnly value={ticket.relatedSystem.name} />
          </div>
        </div>
        <div className="mb-2">
          <label className="form-label lab2-toolbar-label" htmlFor="staff-info-summary">Summary</label>
          <input id="staff-info-summary" className="form-control" readOnly value={ticket.summary} />
        </div>
        <div className="mb-2">
          <label className="form-label lab2-toolbar-label" htmlFor="staff-info-description">Description</label>
          <textarea id="staff-info-description" className="form-control" readOnly rows={3} value={ticket.description} />
        </div>
        <div className="row g-2 mb-2">
          <div className="col-md-3">
            <span className="form-label lab2-toolbar-label d-block">Req. Priority</span>
            <div className="form-control"><PriorityBadge value={ticket.requestedPriority} /></div>
          </div>
          <div className="col-md-3">
            <span className="form-label lab2-toolbar-label d-block">IT Priority</span>
            <div className="form-control"><PriorityBadge value={ticket.itPriority} /></div>
          </div>
          <div className="col-md-3">
            <span className="form-label lab2-toolbar-label d-block">Status</span>
            <div className="form-control"><StatusBadge value={ticket.currentStatus} /></div>
          </div>
          <div className="col-md-3">
            <span className="form-label lab2-toolbar-label d-block">Owner</span>
            <div className="form-control">
              {ticket.ticketOwner ? `${ticket.ticketOwner.name} (${ticket.ticketOwner.role})` : "Unassigned"}
            </div>
          </div>
        </div>
        <div className="row g-2">
          <div className="col-md-6">
            <span className="form-label lab2-toolbar-label d-block">Requester Indication</span>
            <div className="form-control">{indication}</div>
          </div>
          <div className="col-md-6">
            <span className="form-label lab2-toolbar-label d-block">Last Updated</span>
            <div className="form-control">{formatBangkok(ticket.updatedAt)}</div>
          </div>
        </div>
      </section>

      <section className="card p-3" aria-label="Ticket workspace">
        <div className="staff-detail-tabs mb-3" role="tablist" aria-label="Ticket sections">
          {(
            [
              ["comments", "Public Comments"],
              ["notes", "Internal Notes"],
              ["attachments", "Attachments"],
              ["actions", "Ticket Actions"],
            ] as Array<[Tab, string]>
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              className={`staff-detail-tab ${tab === key ? "active" : ""}`}
              onClick={() => setTab(key)}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === "comments" && (
          <div role="tabpanel">
            <h3 className="h6">Public Comments</h3>
            <p className="form-text">Visible to Requester, IT Staff and Administrators.</p>
            <MessageComposer
              kind="comment"
              onPost={async (content) => {
                const created = await postTicketComment(ticketId, content);
                setComments((prev) => [...prev, created]);
              }}
            />
            <MessageTimeline items={comments} emptyText="No public comments yet." />
          </div>
        )}

        {tab === "notes" && (
          <div role="tabpanel">
            <h3 className="h6">Internal Notes</h3>
            <p className="form-text">Visible only to IT Staff and Administrators.</p>
            <MessageComposer
              kind="note"
              onPost={async (content) => {
                const created = await postTicketNote(ticketId, content);
                setNotes((prev) => [...prev, created]);
              }}
            />
            <MessageTimeline items={notes} emptyText="No internal notes yet." />
          </div>
        )}

        {tab === "attachments" && (
          <div role="tabpanel">
            <h3 className="h6">Attachments</h3>
            <p className="form-text">Existing requester attachments available to authorized staff.</p>
            {ticket.attachments.length === 0 && <p className="text-secondary">No attachments on this ticket.</p>}
            {ticket.attachments.length > 0 && (
              <ul className="list-group">
                {ticket.attachments.map((a) => (
                  <li key={a.id} className="list-group-item d-flex justify-content-between align-items-center">
                    <span>{a.originalFilename} · {formatFileSize(a.sizeBytes)}{a.removedAt ? " (removed)" : ""}</span>
                    {!a.removedAt && (
                      <button
                        type="button"
                        className="btn btn-outline-success btn-sm"
                        onClick={() => void downloadAttachment(a.id).catch(() => setActionError("Download failed"))}
                      >
                        Download {a.originalFilename}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {tab === "actions" && (
          <div role="tabpanel">
            <h3 className="h6">Ticket Actions</h3>
            <p className="form-text mb-3">Operational changes are explicit and do not modify Requested Priority.</p>

            {actionError && (
              <div className="alert alert-danger d-flex justify-content-between align-items-center" role="alert">
                <span>{actionError}</span>
                <button className="btn btn-outline-success btn-sm" onClick={() => void load()}>
                  Refresh
                </button>
              </div>
            )}
            {actionOk && (
              <div className="alert alert-success" role="status">{actionOk}</div>
            )}

            {canClaim && (
              <div className="claim-box mb-3">
                <strong>Ticket Owner: Unassigned</strong>
                <p className="text-secondary mb-2">Claiming this NEW ticket assigns it to you and changes formal status to OPEN.</p>
                <button type="button" className="btn btn-success" disabled={saving} onClick={() => void onClaim()}>
                  Claim Ticket
                </button>
              </div>
            )}

            <div className="operations-grid lab3-operations-grid">
              <div className="operation-card lab3-operation-card mb-3">
                <label htmlFor="staff-detail-owner" className="form-label">Ticket Owner</label>
                <select
                  id="staff-detail-owner"
                  className="form-select"
                  value={ownerDraft}
                  disabled={terminalLocked || saving}
                  onChange={(e) => setOwnerDraft(e.target.value)}
                >
                  <option value="">Choose eligible owner…</option>
                  {owners.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
                {canClaim && (
                  <div className="form-text">Direct assign opens the ticket without claiming first.</div>
                )}
                <button type="button" className="btn btn-outline-success w-100 mt-2" disabled={terminalLocked || saving || ownerDraft === ""} onClick={() => void onSaveOwner()}>
                  Update Owner
                </button>
              </div>

              <div className="operation-card lab3-operation-card mb-3">
                <label htmlFor="staff-detail-priority" className="form-label">IT Priority</label>
                <select
                  id="staff-detail-priority"
                  className="form-select"
                  value={priorityDraft}
                  disabled={terminalLocked || saving || canClaim}
                  onChange={(e) => setPriorityDraft(e.target.value)}
                >
                  {PRIORITIES.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
                {canClaim && <div className="form-text">Editable after claim.</div>}
                <button type="button" className="btn btn-outline-success w-100 mt-2" disabled={terminalLocked || saving || canClaim} onClick={() => void onSavePriority()}>
                  Update IT Priority
                </button>
              </div>

              <div className="operation-card lab3-operation-card mb-3">
                <label htmlFor="staff-detail-status" className="form-label">Current Status</label>
                <select
                  id="staff-detail-status"
                  className="form-select"
                  value={statusDraft}
                  disabled={saving || canClaim || nextOptions.length === 0}
                  onChange={(e) => setStatusDraft(e.target.value)}
                >
                  <option value="">Choose next status…</option>
                  {nextOptions.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
                {canClaim && <div className="form-text">Claim first to begin work.</div>}
                {ticket.currentStatus === "CLOSED" && (
                  <div className="mt-2">
                    <label htmlFor="staff-detail-reopen-owner" className="form-label">Replacement Owner</label>
                    <select
                      id="staff-detail-reopen-owner"
                      className="form-select"
                      value={reopenOwnerDraft}
                      disabled={saving}
                      onChange={(e) => setReopenOwnerDraft(e.target.value)}
                    >
                      <option value="">Keep historical owner…</option>
                      {owners.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.name}
                        </option>
                      ))}
                    </select>
                    <div className="form-text">Required when the historical owner is no longer eligible.</div>
                  </div>
                )}
                <button type="button" className="btn btn-success w-100 mt-2" disabled={saving || canClaim || statusDraft === ""} onClick={() => void onSaveStatus()}>
                  Update Status
                </button>
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
