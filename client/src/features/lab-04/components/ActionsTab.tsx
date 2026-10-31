import { useCallback, useEffect, useRef, useState } from "react";
import {
  listTicketActions,
  createTicketAction,
  updateTicketAction,
  completeTicketAction,
  cancelTicketAction,
  listStaffActionEvents,
  listRequesterActionEvents,
  type ActionTaken,
  type ActionEvent,
  type EligibleOwner,
} from "../../../api.js";
import { ActionTable } from "./ActionTable.js";
import { ActionForm } from "./ActionForm.js";

const TERMINAL_TICKETS = ["RESOLVED", "CLOSED", "CANCELLED"];

function conflictCopy(code: string | undefined, fallback: string): string {
  if (code === "ACTION_STATE_CHANGED") {
    return "Someone else changed this action. The list was refreshed — review the latest version and retry.";
  }
  if (code === "INVALID_ACTION_TRANSITION") {
    return "This ticket or action is no longer actionable. The view was refreshed to its read-only state.";
  }
  if (code === "ACTION_ASSIGNEE_NOT_ELIGIBLE") {
    return "The assignee is no longer eligible. Edit the action to pick someone else.";
  }
  if (code === "IDEMPOTENCY_CONFLICT") {
    return "This looks like a conflicting retry — no duplicate was created.";
  }
  return fallback;
}

export interface ActionsTabProps {
  ticketId: number;
  ticketStatus: string;
  mode: "staff" | "requester";
  owners: EligibleOwner[];
  ticketCycle?: number | null;
}

// Issue #78 — Actions Taken area for Ticket Detail (staff mutate + read,
// requester read-only). Server owns authorization; the UI renders the
// contract states and never invents transitions.
// Issue #79 — optional Cycle chip (hidden when the ticket payload carries
// no cycle, never stale).
export function ActionsTab({ ticketId, ticketStatus, mode, owners, ticketCycle }: ActionsTabProps) {
  const terminal = TERMINAL_TICKETS.includes(ticketStatus);
  const canMutate = mode === "staff" && !terminal;
  const [actions, setActions] = useState<ActionTaken[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [historyId, setHistoryId] = useState<number | null>(null);
  const [events, setEvents] = useState<ActionEvent[] | null>(null);
  const [notice, setNotice] = useState("");
  const [problem, setProblem] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);
  const recordBtnRef = useRef<HTMLButtonElement | null>(null);
  // Focus return (ui-spec s.9): after a form/history region closes, focus
  // moves back to the control that opened it. focusKey names either the
  // Record button ("record") or a data-focus-key target. The effect below
  // runs after the closing render so the target exists in the DOM.
  const [focusKey, setFocusKey] = useState<string | null>(null);
  useEffect(() => {
    if (focusKey === null) return;
    const target =
      focusKey === "record" ? recordBtnRef.current : document.querySelector<HTMLElement>(`[data-focus-key="${focusKey}"]`);
    target?.focus();
    setFocusKey(null);
  }, [focusKey, showForm, editingId, historyId, actions]);

  const reload = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const res = await listTicketActions(ticketId);
      setActions(res.actions);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [ticketId]);

  useEffect(() => {
    setShowForm(false);
    setEditingId(null);
    setHistoryId(null);
    setEvents(null);
    setNotice("");
    setProblem("");
    void reload();
  }, [reload]);

  function failureOf(err: unknown): { code?: string; message: string } {
    const e = err as { body?: { error?: { code?: string; message?: string } } };
    return { code: e.body?.error?.code, message: e.body?.error?.message ?? "Unable to connect to TokTickIT API" };
  }

  async function mutate(id: number, fn: () => Promise<ActionTaken>, okText: string) {
    setBusyId(id);
    setNotice("");
    setProblem("");
    try {
      await fn();
      await reload();
      setNotice(okText);
    } catch (err: unknown) {
      const f = failureOf(err);
      await reload();
      setProblem(conflictCopy(f.code, f.message));
    } finally {
      setBusyId(null);
    }
  }

  async function onStart(a: ActionTaken) {
    await mutate(a.id, () => updateTicketAction(a.id, { expectedVersion: a.version, status: "IN_PROGRESS" }), "Action started.");
  }

  async function onComplete(a: ActionTaken) {
    if (!a.result || a.result.trim() === "") {
      setProblem("A result is required before completing — edit the action to add one, then complete.");
      return;
    }
    if (!window.confirm("Complete this action? This is terminal.")) return;
    await mutate(a.id, () => completeTicketAction(a.id, { expectedVersion: a.version, result: a.result as string }), "Action completed.");
  }

  async function onCancelAction(a: ActionTaken) {
    if (!window.confirm("Cancel this action? This is terminal.")) return;
    await mutate(a.id, () => cancelTicketAction(a.id, { expectedVersion: a.version }), "Action cancelled.");
  }

  async function onToggleHistory(a: ActionTaken) {
    if (historyId === a.id) {
      setHistoryId(null);
      setEvents(null);
      setFocusKey(`history-btn-${a.id}`);
      return;
    }
    setHistoryId(a.id);
    setEvents(null);
    setFocusKey(`history-${a.id}`);
    try {
      const res =
        mode === "staff" ? await listStaffActionEvents(a.id) : await listRequesterActionEvents(ticketId, a.id);
      setEvents(res.events);
    } catch {
      setProblem("Unable to load history. Try again.");
    }
  }

  async function onCreateSaved(action: ActionTaken, replayed: boolean) {
    setShowForm(false);
    setFocusKey("record");
    await reload();
    if (replayed) {
      setNotice(`Action already recorded (replay of #${action.id}). No duplicate was created.`);
    } else {
      setNotice("Action recorded.");
    }
  }

  async function onReplaySaved(action: ActionTaken) {
    setShowForm(false);
    await reload();
    setNotice(`Action already recorded (replay of #${action.id}). No duplicate was created.`);
  }

  if (loading && actions === null) return <p className="text-secondary">Loading actions…</p>;
  if (loadError && actions === null) {
    return (
      <div>
        <div className="alert alert-danger" role="alert">
          Unable to load actions.
        </div>
        <button type="button" className="btn btn-outline-success btn-sm" onClick={() => void reload()}>
          Retry
        </button>
      </div>
    );
  }

  const list = actions ?? [];
  const editing = editingId !== null ? list.find((a) => a.id === editingId) ?? null : null;

  return (
    <div>
      <h3 className="h6">
        Actions Taken{typeof ticketCycle === "number" && <span className="badge badge-cycle ms-2">Cycle {ticketCycle}</span>}
      </h3>
      {terminal && <p className="form-text">This ticket is terminal — actions are read-only. Further work requires Reopen first.</p>}
      {notice && (
        <div className="alert alert-success" role="status">
          {notice}
        </div>
      )}
      {problem && (
        <div className="alert alert-danger" role="alert">
          {problem}
        </div>
      )}
      {canMutate && !showForm && editing === null && (
        <button
          type="button"
          className="btn btn-success btn-sm mb-2"
          ref={recordBtnRef}
          onClick={() => setShowForm(true)}
        >
          Record action
        </button>
      )}
      {canMutate && showForm && (
        <div className="mb-3">
          <ActionForm
            ticketId={ticketId}
            owners={owners}
            onSaved={(a, replayed) => void onCreateSaved(a, replayed)}
            onCancel={() => {
              setShowForm(false);
              setFocusKey("record");
            }}
          />
        </div>
      )}
      <ActionTable actions={list} />
      {canMutate && (
        <div className="mt-2 d-flex flex-column gap-2">
          {list
            .filter((a) => a.status === "PLANNED" || a.status === "IN_PROGRESS")
            .map((a) => (
              <div key={a.id} className="d-flex gap-2 align-items-center flex-wrap">
                <span className="form-text">
                  #{a.id} {a.status} (v{a.version})
                </span>
                {a.status === "PLANNED" && (
                  <button type="button" className="btn btn-outline-success btn-sm" disabled={busyId === a.id} onClick={() => void onStart(a)}>
                    Start
                  </button>
                )}
                <button type="button" className="btn btn-outline-success btn-sm" disabled={busyId === a.id} onClick={() => setEditingId(a.id)} data-focus-key={`edit-${a.id}`}>
                  Edit
                </button>
                {a.status === "IN_PROGRESS" && (
                  <>
                    <button type="button" className="btn btn-success btn-sm" disabled={busyId === a.id} onClick={() => void onComplete(a)}>
                      Complete
                    </button>
                    <button type="button" className="btn btn-outline-danger btn-sm" disabled={busyId === a.id} onClick={() => void onCancelAction(a)}>
                      Cancel
                    </button>
                  </>
                )}
                <button type="button" className="btn btn-outline-success btn-sm" data-focus-key={`history-btn-${a.id}`} onClick={() => void onToggleHistory(a)}>
                  History
                </button>
              </div>
            ))}
          {list
            .filter((a) => a.status !== "PLANNED" && a.status !== "IN_PROGRESS")
            .map((a) => (
              <div key={a.id} className="d-flex gap-2 align-items-center flex-wrap">
                <span className="form-text">
                  #{a.id} {a.status} (v{a.version})
                </span>
                <button type="button" className="btn btn-outline-success btn-sm" data-focus-key={`history-btn-${a.id}`} onClick={() => void onToggleHistory(a)}>
                  History
                </button>
              </div>
            ))}
        </div>
      )}
      {!canMutate &&
        list.map((a) => (
          <div key={a.id} className="mt-2">
            <button type="button" className="btn btn-outline-success btn-sm" data-focus-key={`history-btn-${a.id}`} onClick={() => void onToggleHistory(a)}>
              History
            </button>
          </div>
        ))}
      {canMutate && editing && (
        <div className="mb-3 mt-2">
          <ActionForm
            ticketId={ticketId}
            owners={owners}
            initialAction={editing}
            onSaved={(a) => {
              const id = editing?.id;
              setEditingId(null);
              if (id !== undefined) setFocusKey(`edit-${id}`);
              void (async () => {
                await reload();
                setNotice(`Action #${a.id} saved (version ${a.version}).`);
              })();
            }}
            onCancel={() => {
              const id = editing?.id;
              setEditingId(null);
              if (id !== undefined) setFocusKey(`edit-${id}`);
            }}
          />
        </div>
      )}
      {historyId !== null && (
        <div className="mt-2" aria-label={`History for action ${historyId}`} data-focus-key={`history-${historyId}`} tabIndex={-1}>
          <h4 className="h6">History</h4>
          {events === null && <p className="text-secondary">Loading history…</p>}
          {events !== null && events.length === 0 && <p className="text-secondary">No events recorded.</p>}
          {events !== null && events.length > 0 && (
            <ul className="list-group">
              {events.map((e) => (
                <li key={e.id} className="list-group-item">
                  <strong>{e.eventType}</strong> by {e.actor.name} · {e.occurredAt}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
