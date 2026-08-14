const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000";
// Issue 2 + Issue 4 — call the backend.
// Steps: fetch `${API_URL}/api/health`; if not ok, throw.
//        then fetch `${API_URL}/api/categories`; if not ok, throw.
//        return { online: true, categories }.
// Throwing on failure lets the UI show a single Offline/error state.
export async function checkSystem() {
    const healthRes = await fetch(`${API_URL}/api/health`);
    if (!healthRes.ok) {
        throw new Error("Unable to connect to TokTickIT API");
    }
    const health = await healthRes.json();
    if (health.status !== "ok") {
        throw new Error("TokTickIT API is not healthy");
    }
    // TODO(Issue 4): fetch categories and populate the candidates list.
    return { online: true, categories: [] };
}
