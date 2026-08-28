import { useEffect, useState } from "react";
import { fetchRequesters, DevelopmentRequester } from "../api.js";
import { useRequester } from "../contexts/RequesterContext.js";

export default function RequesterSelection() {
  const { setRequester } = useRequester();
  const [requesters, setRequesters] = useState<DevelopmentRequester[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [state, setState] = useState<"loading" | "empty" | "error" | "ready">("loading");
  const [errorMsg, setErrorMsg] = useState("");

  const load = async () => {
    setState("loading");
    setErrorMsg("");
    try {
      const data = await fetchRequesters();
      setRequesters(data);
      if (data.length === 0) setState("empty");
      else setState("ready");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Unable to connect to TokTickIT API");
      setState("error");
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleContinue = () => {
    const r = requesters.find((x) => x.id === selectedId);
    if (r) setRequester(r);
  };

  return (
    <div className="container py-5" style={{ maxWidth: 480 }}>
      <h1 className="h3 mb-2">
        TokTickIT <span className="text-success">IT Service Desk</span>
      </h1>
      <p className="text-secondary small mb-4">
        Select a Development Requester to test requester-specific ticket behavior. This is not a login
        screen. Authentication and role-based access will be introduced in Lab 3.
      </p>

      {state === "loading" && (
        <div className="text-center py-4">
          <div className="spinner-border text-success" role="status" aria-label="Loading">
            <span className="visually-hidden">Loading requesters…</span>
          </div>
          <p className="text-secondary mt-2">Loading requesters…</p>
        </div>
      )}

      {state === "error" && (
        <div className="alert alert-danger" role="alert">
          <p className="mb-2">{errorMsg}</p>
          <button className="btn btn-outline-danger btn-sm" onClick={load}>
            Retry
          </button>
        </div>
      )}

      {state === "empty" && (
        <div className="alert alert-info" role="alert">
          No active requesters available
        </div>
      )}

      {(state === "ready" || requesters.length > 0) && state !== "loading" && state !== "error" && state !== "empty" && (
        <>
          <div className="mb-3">
            <label htmlFor="requester-select" className="form-label fw-semibold">
              Development Requester <span className="text-danger">*</span>
            </label>
            <select
              id="requester-select"
              className="form-select"
              value={selectedId ?? ""}
              onChange={(e) => setSelectedId(e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">-- Select a requester --</option>
              {requesters.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} ({r.email})
                </option>
              ))}
            </select>
          </div>
          <button
            className="btn btn-success w-100"
            onClick={handleContinue}
            disabled={selectedId === null}
          >
            Continue
          </button>
        </>
      )}
    </div>
  );
}
