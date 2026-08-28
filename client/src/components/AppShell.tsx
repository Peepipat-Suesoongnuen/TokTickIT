import { NavLink } from "react-router-dom";
import { useRequester } from "../contexts/RequesterContext.js";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { requester, clearRequester } = useRequester();

  return (
    <>
      <header style={{ backgroundColor: "#006B3C" }} className="text-white py-2">
        <div className="container d-flex justify-content-between align-items-center" style={{ maxWidth: 1200 }}>
          <span className="fw-bold">
            TokTickIT <span className="fw-normal small">IT Service Desk</span>
          </span>
          {requester && (
            <div className="d-flex align-items-center gap-2">
              <span className="badge rounded-pill" style={{ backgroundColor: "#EAF6EF", color: "#006B3C" }}>
                {requester.name}
              </span>
              <button className="btn btn-outline-light btn-sm" onClick={clearRequester}>
                Change Requester
              </button>
            </div>
          )}
        </div>
      </header>
      <nav className="border-bottom bg-white">
        <div className="container d-flex gap-3 py-2" style={{ maxWidth: 1200 }}>
          <NavLink
            to="/my-tickets"
            className={({ isActive }) => (isActive ? "fw-bold text-success" : "text-secondary text-decoration-none")}
            style={({ isActive }) => (isActive ? { borderBottom: "2px solid #0B7A46", paddingBottom: 4 } : {})}
          >
            My Tickets
          </NavLink>
          <NavLink
            to="/create"
            className={({ isActive }) => (isActive ? "fw-bold text-success" : "text-secondary text-decoration-none")}
            style={({ isActive }) => (isActive ? { borderBottom: "2px solid #0B7A46", paddingBottom: 4 } : {})}
          >
            Create Ticket
          </NavLink>
        </div>
      </nav>
      <main className="container py-4" style={{ maxWidth: 1200 }}>
        {children}
      </main>
    </>
  );
}
