import { Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import Login from "./pages/Login";
import ChangePassword from "./pages/ChangePassword";
import AppShell from "./components/AppShell";
import CreateTicket from "./pages/CreateTicket";
import MyTickets from "./pages/MyTickets";
import TicketDetail from "./pages/TicketDetail";

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

  return (
    <AppShell>
      <Routes>
        <Route path="/my-tickets" element={<MyTickets />} />
        <Route path="/create" element={<CreateTicket />} />
        <Route path="/tickets/:id" element={<TicketDetail />} />
        <Route path="/change-password" element={<ChangePassword />} />
        <Route path="*" element={<Navigate to="/my-tickets" replace />} />
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
