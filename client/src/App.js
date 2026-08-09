import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState } from "react";
import { checkSystem } from "./api.js";
export default function App() {
    const [state, setState] = useState("idle");
    const [categories, setCategories] = useState([]);
    const [error, setError] = useState("");
    async function handleCheck() {
        setState("loading");
        setError("");
        try {
            const result = await checkSystem();
            setCategories(result.categories);
            setState("success");
        }
        catch (err) {
            setError(err instanceof Error ? err.message : "Unable to connect to TokTickIT API");
            setState("error");
        }
    }
    return (_jsxs("div", { className: "container py-5", style: { maxWidth: 640 }, children: [_jsxs("h1", { className: "h3 mb-4", children: ["TokTickIT ", _jsx("span", { className: "text-success", children: "IT Service Desk" })] }), _jsx("button", { className: "btn btn-success", onClick: handleCheck, disabled: state === "loading", children: state === "loading" ? "Loading…" : "Check System" }), state === "loading" && _jsx("p", { className: "mt-3 text-secondary", children: "Checking system\u2026" }), state === "success" && (_jsxs("div", { className: "mt-3", children: [_jsx("p", { className: "fw-bold text-success", children: "System Status: Online" }), categories.length > 0 && (_jsxs(_Fragment, { children: [_jsx("p", { className: "mb-1", children: "Supported Request Categories" }), _jsx("ul", { children: categories.map((c) => (_jsx("li", { children: c.name }, c.id))) })] }))] })), state === "error" && (_jsxs("div", { className: "mt-3", children: [_jsx("p", { className: "fw-bold text-danger", children: "System Status: Offline" }), _jsx("p", { className: "text-danger", children: error || "Unable to connect to TokTickIT API" })] }))] }));
}
