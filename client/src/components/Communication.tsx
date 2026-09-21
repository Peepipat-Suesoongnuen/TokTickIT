import { useState } from "react";
import { formatBangkok } from "./AttachmentSection.js";
import type { TicketComment, TicketNote } from "../api.js";

// Issue #49 (Lab 3) — shared communication rendering (ui-spec §6.4).
// Timelines render user-authored content as plain React text (never
// executable HTML — SEC-08); composers enforce channel length budgets with
// visible counters. Public vs private channels are distinguished by
// explicit words, never color alone.

export type Message = TicketComment | TicketNote;

export function MessageTimeline({ items, emptyText }: { items: Message[]; emptyText: string }) {
  if (items.length === 0) {
    return <p className="text-secondary">{emptyText}</p>;
  }
  return (
    <div className="lab3-timeline">
      {items.map((m) => (
        <div key={m.id} className="lab3-message mb-2">
          <div className="comment-meta text-secondary small">
            <span className="comment-author fw-semibold">{m.author.name}</span>
            <span> · {m.author.role}</span>
            <span> · {formatBangkok(m.createdAt)}</span>
          </div>
          <div>{m.content}</div>
        </div>
      ))}
    </div>
  );
}

export function MessageComposer({
  kind,
  onPost,
  disabled,
}: {
  kind: "comment" | "note";
  onPost: (content: string) => Promise<void>;
  disabled?: boolean;
}) {
  const max = kind === "comment" ? 200 : 2000;
  const [draft, setDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const trimmed = draft.trim();
  const canPost = !disabled && !submitting && trimmed.length >= 1 && trimmed.length <= max;

  async function submit() {
    if (!canPost) return;
    setSubmitting(true);
    setError("");
    try {
      await onPost(trimmed);
      setDraft("");
    } catch (err: unknown) {
      const e = err as { body?: { error?: { message?: string } } };
      setError(e.body?.error?.message ?? "Unable to post. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const placeholder = kind === "comment" ? "Add a public comment…" : "Add an internal note…";
  const buttonLabel = kind === "comment" ? "Post Comment" : "Add Note";

  return (
    <div className="comment-compose-block mb-3">
      <div className="comment-input-row d-flex gap-2 align-items-start">
        <div className="flex-grow-1">
          {kind === "comment" ? (
            <input
              className="form-control"
              placeholder={placeholder}
              maxLength={max}
              value={draft}
              disabled={disabled || submitting}
              onChange={(e) => setDraft(e.target.value)}
              aria-label="Add a public comment"
            />
          ) : (
            <textarea
              className="form-control"
              rows={3}
              placeholder={placeholder}
              maxLength={max}
              value={draft}
              disabled={disabled || submitting}
              onChange={(e) => setDraft(e.target.value)}
              aria-label="Add an internal note"
            />
          )}
          <div className="form-text">
            {draft.length} / {max}
          </div>
        </div>
        <button
          type="button"
          className={`btn text-nowrap ${kind === "comment" ? "btn-success" : "btn-outline-success"}`}
          disabled={!canPost}
          onClick={() => void submit()}
        >
          {buttonLabel}
        </button>
      </div>
      {error && (
        <div className="alert alert-danger mt-2" role="alert">
          {error}
        </div>
      )}
    </div>
  );
}
