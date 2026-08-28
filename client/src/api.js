const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000";
export async function fetchRequesters() {
    const res = await fetch(`${API_URL}/api/requesters`);
    if (!res.ok) {
        const body = await res.json().catch(() => null);
        const msg = body?.error?.message ?? "Unable to connect to TokTickIT API";
        throw new Error(msg);
    }
    return res.json();
}
// Issue 2 + Issue 4 — call the backend.
// Steps: fetch `${API_URL}/api/health`; if not ok, throw.
//        then fetch `${API_URL}/api/categories`; if not ok, throw.
//        return { online: true, categories }.
// Throwing on failure lets the UI show a single Offline/error state.
export async function checkSystem() {
    // A thrown fetch (network error) or a non-ok HTTP response must surface as a
    // single friendly message so the UI never shows the raw "Failed to fetch".
    try {
        const healthRes = await fetch(`${API_URL}/api/health`);
        if (!healthRes.ok) {
            throw new Error("Unable to connect to TokTickIT API");
        }
        const health = await healthRes.json();
        if (health.status !== "ok") {
            throw new Error("TokTickIT API is not healthy");
        }
        const categoriesRes = await fetch(`${API_URL}/api/categories`);
        if (!categoriesRes.ok) {
            throw new Error("Unable to connect to TokTickIT API");
        }
        const categories = await categoriesRes.json();
        return { online: true, categories };
    }
    catch (err) {
        if (err instanceof Error && err.message !== "Failed to fetch") {
            throw err;
        }
        throw new Error("Unable to connect to TokTickIT API");
    }
}
