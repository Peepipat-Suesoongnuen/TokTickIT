import { Routes, Route, Navigate } from "react-router-dom";
import { useRequester } from "./contexts/RequesterContext";
import RequesterSelection from "./pages/RequesterSelection";
import AppShell from "./components/AppShell";
import CreateTicket from "./pages/CreateTicket";
import MyTickets from "./pages/MyTickets";
import TicketDetail from "./pages/TicketDetail";

function Placeholder({ text }: { text: string }) {
  return <p className="text-secondary">{text}</p>;
}

export default function App() {
  const { requester } = useRequester();

  if (!requester) {
    return <RequesterSelection />;
  }

  return (
    <AppShell>
      <Routes>
        <Route path="/my-tickets" element={<MyTickets />} />
        <Route path="/create" element={<CreateTicket />} />
        <Route path="/tickets/:id" element={<TicketDetail />} />
        <Route path="*" element={<Navigate to="/my-tickets" replace />} />
      </Routes>
    </AppShell>
  );
}
