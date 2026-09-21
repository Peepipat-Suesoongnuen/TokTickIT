import { useEffect, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { getTicketDetail, downloadAttachment, removeAttachment, uploadAttachment, listTicketComments, postTicketComment, markProblemResolved, TicketComment } from "../api";
import AttachmentSection, { Attachment, formatBangkok } from "../components/AttachmentSection";
import { PriorityBadge, StatusBadge } from "../components/Badges.js";
import { MessageTimeline, MessageComposer } from "../components/Communication.js";

interface TicketDetailData {
  id: number;
  ticketNumber: string;
  ticketDate: string;
  summary: string;
  description: string;
  requestedPriority: string;
  currentStatus: string;
  category: { id: number; name: string };
  relatedSystem: { id: number; name: string };
  requester: { id: number; name: string; email: string };
  // Issue #49 (AC-06): Assigned To/Unassigned, IT Priority, and the
  // resolution indication ride the owned detail (optional for legacy
  // mocks that predate the fields).
  ticketOwner?: { id: number; name: string } | null;
  itPriority?: string;
  requesterResolutionIndicatedAt?: string | null;
  attachments: Attachment[];
  createdAt: string;
  updatedAt: string;
}

// Client-side offer mirror of the BR-05 matrix (api-spec §7.3); the
// backend remains the enforcement authority.
const RESOLUTION_ALLOWED = new Set(["NEW", "OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER", "REOPENED"]);

export default function TicketDetail() {
  const { id } = useParams<{ id: string }>();
  const [ticket, setTicket] = useState<TicketDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [tab, setTab] = useState<"comments" | "attachments" | "actions">("comments");
  const [comments, setComments] = useState<TicketComment[]>([]);
  const [commentsError, setCommentsError] = useState<string | null>(null);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);
  const requestSeq = useRef(0);

  async function load() {
    if (!id) return;
    const seq = ++requestSeq.current;
    setLoading(true);
    setError(null);
    setNotFound(false);
    try {
      const data = await getTicketDetail(Number(id));
      if (seq !== requestSeq.current) return;
      setTicket(data);
      try {
        const list = await listTicketComments(Number(id));
        if (seq !== requestSeq.current) return;
        setComments(list.data);
        setCommentsError(null);
      } catch {
        if (seq !== requestSeq.current) return;
        setCommentsError("Unable to load comments.");
      }
    } catch (err: unknown) {
      if (seq !== requestSeq.current) return;
      const e = err as { status?: number };
      if (e?.status === 404) setNotFound(true);
      else setError((err as Error).message ?? "Unable to connect to TokTickIT API");
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
  }

  useEffect(() => {
    load();
    return () => { requestSeq.current += 1; };
  }, [id]);

  async function handleUpload(file: File) {
    if (!ticket) return;
    try {
      setUploadError(null);
      await uploadAttachment(ticket.id, file);
      await load();
    } catch (err: unknown) {
      const e = err as { body?: { error?: { message?: string } } };
      setUploadError(e.body?.error?.message ?? (err as Error).message ?? "Upload failed");
    }
  }

  async function handleDownload(attId: number) {
    if (!ticket) return;
    try {
      setAttachmentError(null);
      await downloadAttachment(attId);
    } catch (err: unknown) {
      setAttachmentError((err as { message?: string })?.message ?? "Unable to download attachment");
    }
  }

  async function handleRemove(attId: number, reason: string) {
    if (!ticket) return;
    try {
      setAttachmentError(null);
      await removeAttachment(attId, reason);
      await load();
    } catch (err: unknown) {
      const msg = (err as { body?: { error?: { message?: string } }; message?: string })?.body?.error?.message ?? (err as Error).message ?? "Unable to remove attachment";
      setAttachmentError(msg);
      throw err;
    }
  }

  if (loading) return <p className="text-secondary">Loading ticket…</p>;
  if (notFound) return <div><p>Ticket not found</p><Link to="/my-tickets">Back to My Tickets</Link></div>;
  if (error) return <div><div className="alert alert-danger" role="alert" aria-live="polite">{error}</div><button className="btn btn-outline-success" onClick={load}>Retry</button></div>;
  if (!ticket) return null;

  const activeCount = ticket.attachments.filter((a) => !a.removedAt).length;
  const canUpload = activeCount < 5;
  const indicated = !!ticket.requesterResolutionIndicatedAt;
  const resolutionOffered = RESOLUTION_ALLOWED.has(ticket.currentStatus) && !indicated;

  async function handleResolve() {
    if (!ticket) return;
    setResolving(true);
    setResolveError(null);
    try {
      await markProblemResolved(ticket.id);
      await load();
    } catch (err: unknown) {
      const e = err as { body?: { error?: { message?: string } } };
      setResolveError(e.body?.error?.message ?? "Unable to record. Please try again.");
    } finally {
      setResolving(false);
    }
  }

  return (
    <div className="container py-4" style={{ maxWidth: 900 }}>
      <nav aria-label="Breadcrumb">
        <ol className="breadcrumb">
          <li className="breadcrumb-item">
            <Link to="/my-tickets">My Tickets</Link>
          </li>
          <li className="breadcrumb-item active" aria-current="page">
            Ticket Detail
          </li>
        </ol>
      </nav>
      <div className="d-flex justify-content-between align-items-center gap-2 mb-3 lab2-mobile-stack lab2-screen-heading">
        <h1 className="h4 mb-0">Ticket {ticket.ticketNumber}</h1>
        <Link className="btn btn-outline-success" to="/my-tickets">
          Back to My Tickets
        </Link>
      </div>
      <div className="card mb-3">
        <div className="card-body">
          <div className="row g-3">
            <div className="col-md-6 col-lg-4">
              <label className="form-label">Ticket Number</label>
              <input className="form-control form-readonly" value={ticket.ticketNumber} readOnly aria-label="Ticket Number" />
            </div>
            <div className="col-md-6 col-lg-4">
              <label className="form-label">Ticket Date</label>
              <input className="form-control form-readonly" value={formatBangkok(ticket.ticketDate)} readOnly aria-label="Ticket Date" />
            </div>
            <div className="col-md-6 col-lg-4">
              <label className="form-label">Requester</label>
              <input className="form-control form-readonly" value={ticket.requester.name} readOnly aria-label="Requester" />
            </div>
            <div className="col-md-6">
              <label className="form-label">Category</label>
              <input className="form-control form-readonly" value={ticket.category.name} readOnly aria-label="Category" />
            </div>
            <div className="col-md-6">
              <label className="form-label">Related System</label>
              <input className="form-control form-readonly" value={ticket.relatedSystem.name} readOnly aria-label="Related System" />
            </div>
            <div className="col-12">
              <label className="form-label">Summary</label>
              <input className="form-control form-readonly" value={ticket.summary} readOnly aria-label="Summary" />
            </div>
            <div className="col-12">
              <label className="form-label">Description</label>
              <textarea className="form-control form-readonly" value={ticket.description} readOnly rows={4} aria-label="Description" />
            </div>
            <div className="col-md-6 col-lg-3">
              <label className="form-label">Assigned To</label>
              <input
                className="form-control form-readonly"
                value={ticket.ticketOwner ? ticket.ticketOwner.name : "Unassigned"}
                readOnly
                aria-label="Assigned To"
              />
            </div>
            <div className="col-md-6 col-lg-3">
              <label className="form-label">Req. Priority</label>
              <div className="form-control form-readonly">
                <PriorityBadge value={ticket.requestedPriority} />
              </div>
            </div>
            <div className="col-md-6 col-lg-3">
              <label className="form-label">Status</label>
              <div className="form-control form-readonly">
                <StatusBadge value={ticket.currentStatus} />
              </div>
            </div>
            <div className="col-md-6 col-lg-3">
              <label className="form-label">Last Updated</label>
              <input
                className="form-control form-readonly"
                value={formatBangkok(ticket.updatedAt)}
                readOnly
                aria-label="Last Updated"
              />
            </div>
          </div>
        </div>
      </div>
      {uploadError ? <div className="alert alert-danger" role="alert" aria-live="polite">{uploadError}</div> : null}
      {attachmentError ? <div className="alert alert-warning" role="alert" aria-live="polite">{attachmentError}</div> : null}

      <section className="card" aria-label="Ticket communication and actions">
        <div className="card-body">
          <div className="lab3-rd-tabs mb-3" role="tablist" aria-label="Ticket detail sections">
            {(
              [
                ["comments", "Public Comments"],
                ["attachments", "Attachments"],
                ["actions", "Ticket Actions"],
              ] as Array<["comments" | "attachments" | "actions", string]>
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={tab === key}
                className={`lab3-rd-tab ${tab === key ? "active" : ""}`}
                onClick={() => setTab(key)}
              >
                {label}
              </button>
            ))}
          </div>

          {tab === "comments" && (
            <div role="tabpanel">
              <h2 className="h6">Public Comments</h2>
              <p className="form-text">Visible to you and the IT team.</p>
              {commentsError && (
                <div className="alert alert-warning" role="alert">
                  {commentsError}
                </div>
              )}
              <MessageComposer
                kind="comment"
                onPost={async (content) => {
                  const created = await postTicketComment(ticket.id, content);
                  setComments((prev) => [...prev, created]);
                }}
              />
              <MessageTimeline items={comments} emptyText="No public comments yet." />
            </div>
          )}

          {tab === "attachments" && (
            <div role="tabpanel">
              <AttachmentSection attachments={ticket.attachments} onDownload={handleDownload} onRemove={handleRemove} onRetry={load} onUpload={handleUpload} canUpload={canUpload} />
            </div>
          )}

          {tab === "actions" && (
            <div role="tabpanel">
              <h2 className="h6">Ticket Actions</h2>
              {indicated && (
                <div className="alert alert-success" role="status">
                  You indicated that the problem appears resolved.
                  <div className="form-text mt-1">
                    The formal ticket status is still {ticket.currentStatus}. IT Staff will decide whether to resolve or close the ticket.
                  </div>
                </div>
              )}
              {resolutionOffered && (
                <div className="service-action-row d-flex justify-content-between align-items-center gap-3">
                  <div className="service-action-copy">
                    <h3 className="h6">Problem Appears Resolved</h3>
                    <p className="text-secondary mb-0">Let IT know that the reported problem appears resolved. This does not close the ticket.</p>
                  </div>
                  <button
                    type="button"
                    className="btn btn-outline-success text-nowrap"
                    disabled={resolving}
                    onClick={() => void handleResolve()}
                  >
                    Problem Appears Resolved
                  </button>
                </div>
              )}
              {resolveError && (
                <div className="alert alert-danger mt-2" role="alert">
                  {resolveError}
                </div>
              )}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
