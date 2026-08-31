import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useRequester } from "../contexts/RequesterContext";
import { getTicketDetail, downloadAttachment, removeAttachment, uploadAttachment } from "../api";
import AttachmentSection, { Attachment } from "../components/AttachmentSection";

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

  async function load() {
    if (!requester || !id) return;
    setLoading(true);
    setError(null);
    setNotFound(false);
    try {
      const data = await getTicketDetail(Number(id), requester.id);
      setTicket(data);
    } catch (err: unknown) {
      const e = err as { status?: number };
      if (e?.status === 404) setNotFound(true);
      else setError((err as Error).message ?? "Unable to connect to TokTickIT API");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
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
      await downloadAttachment(attId, requester.id);
    } catch {
      setError("Unable to download attachment");
    }
  }

  async function handleRemove(attId: number, reason: string) {
    if (!ticket || !requester) return;
    try {
      await removeAttachment(attId, requester.id, reason);
      await load();
    } catch (err: unknown) {
      setError((err as Error).message ?? "Unable to remove attachment");
    }
  }

  if (loading) return <p className="text-secondary">Loading ticket…</p>;
  if (notFound) return <div><p>Ticket not found</p><Link to="/my-tickets">Back to My Tickets</Link></div>;
  if (error) return <div><div className="alert alert-danger">{error}</div><button className="btn btn-outline-secondary" onClick={load}>Retry</button></div>;
  if (!ticket) return null;

  const activeCount = ticket.attachments.filter((a) => !a.removedAt).length;
  const canUpload = activeCount < 5;

  return (
    <div className="container py-4" style={{ maxWidth: 900 }}>
      <h1 className="h4">Ticket {ticket.ticketNumber}</h1>
      <div className="card mb-3">
        <div className="card-body">
          <div className="row g-3">
            <div className="col-md-6">
              <label className="form-label">Ticket Number</label>
              <input className="form-control" value={ticket.ticketNumber} readOnly style={{ backgroundColor: "#EEF3EF" }} />
            </div>
            <div className="col-md-6">
              <label className="form-label">Requester</label>
              <input className="form-control" value={ticket.requester.name} readOnly style={{ backgroundColor: "#EEF3EF" }} />
            </div>
            <div className="col-md-6">
              <label className="form-label">Category</label>
              <input className="form-control" value={ticket.category.name} readOnly style={{ backgroundColor: "#EEF3EF" }} />
            </div>
            <div className="col-md-6">
              <label className="form-label">Related System</label>
              <input className="form-control" value={ticket.relatedSystem.name} readOnly style={{ backgroundColor: "#EEF3EF" }} />
            </div>
            <div className="col-12">
              <label className="form-label">Summary</label>
              <input className="form-control" value={ticket.summary} readOnly style={{ backgroundColor: "#EEF3EF" }} />
            </div>
            <div className="col-12">
              <label className="form-label">Description</label>
              <textarea className="form-control" value={ticket.description} readOnly rows={4} style={{ backgroundColor: "#EEF3EF" }} />
            </div>
            <div className="col-md-6">
              <span className="badge bg-success">{ticket.requestedPriority}</span>
              <span className="badge bg-light text-success ms-2">{ticket.currentStatus}</span>
            </div>
          </div>
        </div>
      </div>
      {uploadError ? <div className="alert alert-danger">{uploadError}</div> : null}
      <AttachmentSection attachments={ticket.attachments} onDownload={handleDownload} onRemove={handleRemove} onUpload={handleUpload} canUpload={canUpload} />
    </div>
  );
}
