import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Routes, Route, Navigate } from "react-router-dom";
import { useRequester } from "./contexts/RequesterContext";
import RequesterSelection from "./pages/RequesterSelection";
import AppShell from "./components/AppShell";
import CreateTicket from "./pages/CreateTicket";
function Placeholder({ text }) { return _jsx("p", { className: "text-secondary", children: text }); }
export default function App() {
    const { requester } = useRequester();
    if (!requester) { return _jsx(RequesterSelection, {}); }
    return _jsxs(AppShell, { children: _jsxs(Routes, { children: [_jsx(Route, { path: "/my-tickets", element: _jsx(Placeholder, { text: "My Tickets \u2014 Coming in Issue 9" }) }), _jsx(Route, { path: "/create", element: _jsx(CreateTicket, {}) }), _jsx(Route, { path: "*", element: _jsx(Navigate, { to: "/my-tickets", replace: true }) })] }) });
}
