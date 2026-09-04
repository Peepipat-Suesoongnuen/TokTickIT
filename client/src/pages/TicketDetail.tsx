import { useEffect, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useRequester } from "../contexts/RequesterContext";
import { getTicketDetail, downloadAttachment, removeAttachment, uploadAttachment } from "../api";
import AttachmentSection, { Attachment, formatBangkok } from "../components/AttachmentSection";

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
  attachments: Attachment[];
  createdAt: string;
  updatedAt: string;
}

export default function TicketDetail() {
  const { id } = useParams<{ id: string }>();
  const { requester } = useRequester();
  const [ticket, setTicket] = useState<TicketDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const requestSeq = useRef(0);

  async function load() {
    if (!requester || !id) return;
    const seq = ++requestSeq.current;
    setLoading(true);
    setError(null);
    setNotFound(false);
    try {
      const data = await getTicketDetail(Number(id), requester.id);
      if (seq !== requestSeq.current) return;
      setTicket(data);
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
  }, [id, requester?.id]);

  async function handleUpload(file: File) {
    if (!ticket || !requester) return;
    try {
      setUploadError(null);
      await uploadAttachment(ticket.id, requester.id, file);
      await load();
    } catch (err: unknown) {
      const e = err as { body?: { error?: { message?: string } } };
      setUploadError(e.body?.error?.message ?? (err as Error).message ?? "Upload failed");
    }
  }

  async function handleDownload(attId: number) {
    if (!ticket || !requester) return;
    try {
      setAttachmentError(null);
      await downloadAttachment(attId, requester.id);
    } catch (err: unknown) {
      setAttachmentError((err as { message?: string })?.message ?? "Unable to download attachment");
    }
  }

  async function handleRemove(attId: number, reason: string) {
    if (!ticket || !requester) return;
    try {
      setAttachmentError(null);
      await removeAttachment(attId, requester.id, reason);
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

  return (
    <div className="container py-4" style={{ maxWidth: 900 }}>
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
            <div className="col-md-6">
              <span className={`badge badge-priority-${ticket.requestedPriority.toLowerCase()}`}>{ticket.requestedPriority}</span>
              <span className={`badge ms-2 ${ticket.currentStatus === "NEW" ? "badge-status-new" : ""}`}>{ticket.currentStatus}</span>
            </div>
          </div>
        </div>
      </div>
      {uploadError ? <div className="alert alert-danger" role="alert" aria-live="polite">{uploadError}</div> : null}
      {attachmentError ? <div className="alert alert-warning" role="alert" aria-live="polite">{attachmentError}</div> : null}
      <AttachmentSection attachments={ticket.attachments} onDownload={handleDownload} onRemove={handleRemove} onRetry={load} onUpload={handleUpload} canUpload={canUpload} />
    </div>
  );
}
