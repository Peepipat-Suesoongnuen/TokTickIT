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
  currentStatus?: string;
  sort?: string;
  order?: string;
  page?: number;
  pageSize?: number;
}

export interface TicketListItem {
  id: number;
  ticketNumber: string;
  summary: string;
  category: { id?: number; name: string };
  relatedSystem?: { id?: number; name: string };
  requestedPriority: string;
  currentStatus: string;
  ticketDate: string;
  updatedAt: string;
  requester?: { id: number };
}

export interface TicketListMeta {
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface ListTicketsResponse {
  data: TicketListItem[];
  meta: TicketListMeta;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isIsoUtcTimestamp(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) &&
    Number.isFinite(Date.parse(value));
}

function parseListTicketsResponse(body: unknown): ListTicketsResponse {
  if (!isRecord(body) || !Array.isArray(body.data) || !isRecord(body.meta)) {
    throw new Error("Invalid My Tickets API response.");
  }

  for (const item of body.data) {
    if (!isRecord(item)) {
      throw new Error("Invalid My Tickets API response.");
    }
    const ticketDate = item.ticketDate;
    if (
      typeof ticketDate !== "string" ||
      ticketDate.trim() === "" ||
      !isIsoUtcTimestamp(ticketDate)
    ) {
      throw new Error("Invalid My Tickets API response: ticketDate is required and must be an ISO 8601 UTC timestamp.");
    }
  }

  return body as unknown as ListTicketsResponse;
}

export async function listTickets(params: ListTicketsParams): Promise<ListTicketsResponse> {
  const qs = new URLSearchParams();
  qs.set("requesterId", String(params.requesterId));
  if (params.search !== undefined) qs.set("search", params.search);
  if (params.categoryId !== undefined) qs.set("categoryId", String(params.categoryId));
  if (params.requestedPriority !== undefined) qs.set("requestedPriority", params.requestedPriority);
  if (params.currentStatus !== undefined) qs.set("currentStatus", params.currentStatus);
  if (params.sort !== undefined) qs.set("sort", params.sort);
  if (params.order !== undefined) qs.set("order", params.order);
  if (params.page !== undefined) qs.set("page", String(params.page));
  if (params.pageSize !== undefined) qs.set("pageSize", String(params.pageSize));
  const res = await fetch(`${API_URL}/api/tickets?${qs.toString()}`);
  const body = await res.json().catch(() => null);
  if (!res.ok) throw { status: res.status, body };
  return parseListTicketsResponse(body);
}

export async function getTicketDetail(ticketId: number, requesterId: number) {
  const res = await fetch(`${API_URL}/api/tickets/${ticketId}?requesterId=${requesterId}`);
  const body = await res.json().catch(() => null);
  if (!res.ok) throw { status: res.status, body, message: body?.error?.message ?? "Unable to connect to TokTickIT API" };
  return body;
}

export async function uploadAttachment(ticketId: number, requesterId: number, file: File) {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${API_URL}/api/tickets/${ticketId}/attachments?requesterId=${requesterId}`, { method: "POST", body: form });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw { status: res.status, body, message: body?.error?.message ?? "Upload failed" };
  return body;
}

export async function getAttachmentMetadata(attachmentId: number, requesterId: number) {
  const res = await fetch(`${API_URL}/api/attachments/${attachmentId}?requesterId=${requesterId}`);
  const body = await res.json().catch(() => null);
  if (!res.ok) throw { status: res.status, body, message: body?.error?.message ?? "Unable to connect to TokTickIT API" };
  return body;
}

export async function downloadAttachment(attachmentId: number, requesterId: number) {
  const res = await fetch(`${API_URL}/api/attachments/${attachmentId}/download?requesterId=${requesterId}`);
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw { status: res.status, body, message: body?.error?.message ?? "Download failed" };
  }
  const blob = await res.blob();
  const disposition = res.headers.get("Content-Disposition") ?? "";
  let filename = "download";
  const starMatch = /filename\*=\s*UTF-8''([^;]+)/i.exec(disposition);
  if (starMatch?.[1]) {
    try { filename = decodeURIComponent(starMatch[1].replace(/'/g, "%27")); } catch { /* fallback */ }
  } else {
    const m = /filename="([^"]+)"/.exec(disposition);
    if (m?.[1]) filename = m[1];
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export async function removeAttachment(attachmentId: number, requesterId: number, reason: string) {
  const res = await fetch(`${API_URL}/api/attachments/${attachmentId}/remove?requesterId=${requesterId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reason }),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw { status: res.status, body, message: body?.error?.message ?? "Unable to remove attachment" };
  return body;
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
