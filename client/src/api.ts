const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

export interface Category {
  id: number;
  name: string;
}

export interface DevelopmentRequester {
  id: number;
  name: string;
  email: string;
}

export interface SystemStatus {
  online: boolean;
  categories: Category[];
}

// Issue 2 + Issue 4 — call the backend.
// Steps: fetch `${API_URL}/api/health`; if not ok, throw.
//        then fetch `${API_URL}/api/categories`; if not ok, throw.
//        return { online: true, categories }.
export async function fetchRequesters(): Promise<DevelopmentRequester[]> {
  const res = await fetch(`${API_URL}/api/requesters`);
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const msg = body?.error?.message ?? "Unable to connect to TokTickIT API";
    throw new Error(msg);
  }
  return res.json();
}

export interface RelatedSystem {
  id: number;
  name: string;
}

export async function fetchCategories(requesterId: number): Promise<Category[]> {
  const res = await fetch(`${API_URL}/api/categories?requesterId=${requesterId}`);
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const msg = body?.error?.message ?? "Unable to connect to TokTickIT API";
    throw new Error(msg);
  }
  return res.json();
}

export async function fetchRelatedSystems(requesterId: number): Promise<RelatedSystem[]> {
  const res = await fetch(`${API_URL}/api/related-systems?requesterId=${requesterId}`);
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const msg = body?.error?.message ?? "Unable to connect to TokTickIT API";
    throw new Error(msg);
  }
  return res.json();
}

export interface CreateTicketPayload {
  requesterId: number;
  categoryId: number;
  relatedSystemId: number;
  summary: string;
  description: string;
  requestedPriority: string;
}

export async function createTicket(payload: CreateTicketPayload) {
  const res = await fetch(`${API_URL}/api/tickets`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw { status: res.status, body };
  return body;
}

export interface ListTicketsParams {
  requesterId: number;
  search?: string;
  categoryId?: number;
  requestedPriority?: string;
  sort?: string;
  order?: string;
  page?: number;
  pageSize?: number;
}

export async function listTickets(params: ListTicketsParams) {
  const qs = new URLSearchParams();
  qs.set("requesterId", String(params.requesterId));
  if (params.search !== undefined) qs.set("search", params.search);
  if (params.categoryId !== undefined) qs.set("categoryId", String(params.categoryId));
  if (params.requestedPriority !== undefined) qs.set("requestedPriority", params.requestedPriority);
  if (params.sort !== undefined) qs.set("sort", params.sort);
  if (params.order !== undefined) qs.set("order", params.order);
  if (params.page !== undefined) qs.set("page", String(params.page));
  if (params.pageSize !== undefined) qs.set("pageSize", String(params.pageSize));
  const res = await fetch(`${API_URL}/api/tickets?${qs.toString()}`);
  const body = await res.json().catch(() => null);
  if (!res.ok) throw { status: res.status, body };
  return body as { data: unknown[]; meta: { page: number; pageSize: number; totalCount: number; totalPages: number; hasNextPage: boolean; hasPreviousPage: boolean } };
}

// Throwing on failure lets the UI show a single Offline/error state.
export async function checkSystem(): Promise<SystemStatus> {
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
    const categories: Category[] = await categoriesRes.json();
    return { online: true, categories };
  } catch (err) {
    if (err instanceof Error && err.message !== "Failed to fetch") {
      throw err;
    }
    throw new Error("Unable to connect to TokTickIT API");
  }
}
