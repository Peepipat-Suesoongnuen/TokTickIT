import { useContext, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useRequester } from "../contexts/RequesterContext.js";
import { AuthContext } from "../contexts/AuthContext.js";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { requester, clearRequester } = useRequester();
  // Tolerate absence of AuthProvider (legacy Lab 2 tests render the shell
  // standalone): the identity menu is omitted, existing nav is untouched.
  const auth = useContext(AuthContext);
  const user = auth?.user ?? null;
  const navigate = useNavigate();
  const [navOpen, setNavOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  async function onLogout() {
    setMenuOpen(false);
    await auth?.logout();
    navigate("/my-tickets");
  }

  return (
    <>
      <header className="zen-header text-white py-2">
        <div className="container d-flex justify-content-between align-items-center lab2-header-row" style={{ maxWidth: 1200 }}>
          <span className="fw-bold">
            TokTickIT <span className="fw-normal small">IT Service Desk</span>
          </span>
          {requester && (
            <div className="d-flex align-items-center gap-2 lab2-requester-actions">
              <span className="badge rounded-pill zen-selected lab2-requester-chip">
                <span aria-hidden="true">👤</span> {requester.name}
              </span>
              <button className="btn btn-outline-light btn-sm" onClick={clearRequester}>
                Change Requester
              </button>
            </div>
          )}
          {user && (
            <div className="d-flex align-items-center gap-2 lab3-user-menu position-relative">
              <span className="text-white-50 small">
                {user.name} · {user.role}
              </span>
              <button
                type="button"
                className="btn btn-outline-light btn-sm"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                aria-label="User menu"
                onClick={() => setMenuOpen((open) => !open)}
              >
                <span aria-hidden="true">▾</span>
              </button>
              {menuOpen && (
                <ul role="menu" className="dropdown-menu show position-absolute end-0 top-100">
                  <li role="none">
                    <button
                      type="button"
                      role="menuitem"
                      className="dropdown-item"
                      onClick={() => {
                        setMenuOpen(false);
                        navigate("/change-password");
                      }}
                    >
                      Change Password
                    </button>
                  </li>
                  <li role="none">
                    <button
                      type="button"
                      role="menuitem"
                      className="dropdown-item"
                      onClick={() => void onLogout()}
                    >
                      Logout
                    </button>
                  </li>
                </ul>
              )}
            </div>
          )}
        </div>
      </header>
      <nav className="border-bottom bg-white" aria-label="Primary navigation">
        <div className="container py-2" style={{ maxWidth: 1200 }}>
          <button
            type="button"
            className="btn btn-outline-success lab2-nav-toggle"
            aria-label="Toggle navigation"
            aria-expanded={navOpen}
            aria-controls="lab2-navigation"
            onClick={() => setNavOpen((open) => !open)}
          >
            <span aria-hidden="true">☰</span>
          </button>
          <div id="lab2-navigation" className={`lab2-nav-links ${navOpen ? "is-open" : ""}`}>
            <NavLink
              to="/my-tickets"
              className={({ isActive }) => `lab2-nav-link ${isActive ? "active" : ""}`}
              onClick={() => setNavOpen(false)}
            >
              My Tickets
            </NavLink>
            <NavLink
              to="/create"
              className={({ isActive }) => `lab2-nav-link ${isActive ? "active" : ""}`}
              onClick={() => setNavOpen(false)}
            >
              Create Ticket
            </NavLink>
          </div>
        </div>
      </nav>
      <main className="container py-4" style={{ maxWidth: 1200 }}>
        {children}
      </main>
    </>
  );
}
