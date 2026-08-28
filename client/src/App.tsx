import { Routes, Route, Navigate } from "react-router-dom";
import { useRequester } from "./contexts/RequesterContext";
import RequesterSelection from "./pages/RequesterSelection";
import AppShell from "./components/AppShell";

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
        <Route path="/my-tickets" element={<Placeholder text="My Tickets — Coming in Issue 9" />} />
        <Route path="/create" element={<Placeholder text="Create Ticket — Coming in Issue 8" />} />
        <Route path="*" element={<Navigate to="/my-tickets" replace />} />
      </Routes>
    </AppShell>
  );
}
