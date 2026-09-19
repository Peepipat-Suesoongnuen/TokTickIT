import { Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import Login from "./pages/Login";
import ChangePassword from "./pages/ChangePassword";
import AppShell from "./components/AppShell";
import CreateTicket from "./pages/CreateTicket";
import MyTickets from "./pages/MyTickets";
import TicketDetail from "./pages/TicketDetail";
import StaffQueue from "./pages/StaffQueue";
import StaffTicketDetail from "./pages/StaffTicketDetail";

function GatedApp() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <p role="status" aria-label="Loading">
        Loading…
      </p>
    );
  }

  if (!user) {
    return <Login />;
  }

  if (user.mustChangePassword) {
    return <ChangePassword />;
  }

  // Issue #48 — role-aware workspace: Requesters keep the Lab 2 ticket
  // flow; IT Staff/Administrator work from the shared Ticket Queue.
  // Backend authorization remains the enforcement authority.
  const isStaffWorkspace = user.role === "IT_STAFF" || user.role === "ADMINISTRATOR";

  return (
    <AppShell>
      <Routes>
        {isStaffWorkspace ? (
          <>
            <Route path="/staff/queue" element={<StaffQueue />} />
            <Route path="/staff/tickets/:id" element={<StaffTicketDetail />} />
            <Route path="/change-password" element={<ChangePassword />} />
            <Route path="*" element={<Navigate to="/staff/queue" replace />} />
          </>
        ) : (
          <>
            <Route path="/my-tickets" element={<MyTickets />} />
            <Route path="/create" element={<CreateTicket />} />
            <Route path="/tickets/:id" element={<TicketDetail />} />
            <Route path="/change-password" element={<ChangePassword />} />
            <Route path="*" element={<Navigate to="/my-tickets" replace />} />
          </>
        )}
      </Routes>
    </AppShell>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <GatedApp />
    </AuthProvider>
  );
}
