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
export async function fetchCategories(requesterId) {
    const res = await fetch(`${API_URL}/api/categories?requesterId=${requesterId}`);
    if (!res.ok) {
        const body = await res.json().catch(() => null);
        const msg = body?.error?.message ?? "Unable to connect to TokTickIT API";
        throw new Error(msg);
    }
    return res.json();
}
export async function fetchRelatedSystems(requesterId) {
    const res = await fetch(`${API_URL}/api/related-systems?requesterId=${requesterId}`);
    if (!res.ok) {
        const body = await res.json().catch(() => null);
        const msg = body?.error?.message ?? "Unable to connect to TokTickIT API";
        throw new Error(msg);
    }
    return res.json();
}
export async function createTicket(payload) {
    const res = await fetch(`${API_URL}/api/tickets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok)
        throw { status: res.status, body };
    return body;
}
export async function checkSystem() {
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
