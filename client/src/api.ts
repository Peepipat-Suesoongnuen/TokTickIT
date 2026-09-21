const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

export interface Category {
  id: number;
  name: string;
}

export interface SystemStatus {
  online: boolean;
  categories: Category[];
}

export interface RelatedSystem {
  id: number;
  name: string;
}

export async function fetchCategories(): Promise<Category[]> {
  // Issue #45 (PR #58 review): GET /api/categories is session-only —
  // `requesterId` is not accepted (unknown query parameter → 400).
  const res = await fetch(`${API_URL}/api/categories`, {
    credentials: "include",
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const msg = body?.error?.message ?? "Unable to connect to TokTickIT API";
    throw new Error(msg);
  }
  return res.json();
}

export async function fetchRelatedSystems(): Promise<RelatedSystem[]> {
  // Issue #45 (PR #58 review): GET /api/related-systems is session-only —
  // `requesterId` is not accepted (unknown query parameter → 400).
  const res = await fetch(`${API_URL}/api/related-systems`, {
    credentials: "include",
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const msg = body?.error?.message ?? "Unable to connect to TokTickIT API";
    throw new Error(msg);
  }
  return res.json();
}

export interface CreateTicketPayload {
  categoryId: number;
  relatedSystemId: number;
  summary: string;
  description: string;
  requestedPriority: string;
}

export async function createTicket(payload: CreateTicketPayload) {
  // Issue #46 — session-derived owner: no requesterId in body or query.
  const res = await fetch(`${API_URL}/api/tickets`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw { status: res.status, body };
  return body;
}

export interface ListTicketsParams {
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
  // Issue #46 — session-derived owner: no requesterId query parameter.
  const qs = new URLSearchParams();
  if (params.search !== undefined) qs.set("search", params.search);
  if (params.categoryId !== undefined) qs.set("categoryId", String(params.categoryId));
  if (params.requestedPriority !== undefined) qs.set("requestedPriority", params.requestedPriority);
  if (params.currentStatus !== undefined) qs.set("currentStatus", params.currentStatus);
  if (params.sort !== undefined) qs.set("sort", params.sort);
  if (params.order !== undefined) qs.set("order", params.order);
  if (params.page !== undefined) qs.set("page", String(params.page));
  if (params.pageSize !== undefined) qs.set("pageSize", String(params.pageSize));
  const suffix = qs.toString();
  const res = await fetch(`${API_URL}/api/tickets${suffix ? `?${suffix}` : ""}`, {
    credentials: "include",
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw { status: res.status, body };
  return parseListTicketsResponse(body);
}

export async function getTicketDetail(ticketId: number) {
  const res = await fetch(`${API_URL}/api/tickets/${ticketId}`, {
    credentials: "include",
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw { status: res.status, body, message: body?.error?.message ?? "Unable to connect to TokTickIT API" };
  return body;
}

export async function uploadAttachment(ticketId: number, file: File) {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${API_URL}/api/tickets/${ticketId}/attachments`, {
    method: "POST",
    body: form,
    credentials: "include",
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw { status: res.status, body, message: body?.error?.message ?? "Upload failed" };
  return body;
}

export async function getAttachmentMetadata(attachmentId: number) {
  const res = await fetch(`${API_URL}/api/attachments/${attachmentId}`, {
    credentials: "include",
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw { status: res.status, body, message: body?.error?.message ?? "Unable to connect to TokTickIT API" };
  return body;
}

export async function downloadAttachment(attachmentId: number) {
  const res = await fetch(`${API_URL}/api/attachments/${attachmentId}/download`, {
    credentials: "include",
  });
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

export async function removeAttachment(attachmentId: number, reason: string) {
  const res = await fetch(`${API_URL}/api/attachments/${attachmentId}/remove`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ reason }),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw { status: res.status, body, message: body?.error?.message ?? "Unable to remove attachment" };
  return body;
}

// Issue #45 — authenticated identity (Lab 3 api-spec §3). Auth calls use
// `credentials: "include"` so the session cookie flows; existing helpers
// above are untouched.

export interface SafeUser {
  id: number;
  name: string;
  email: string;
  role: string;
  active: boolean;
  mustChangePassword: boolean;
}

export interface AuthFailure {
  status: number;
  body: {
    error?: { code?: string; message?: string };
    fieldErrors?: Record<string, string>;
  } | null;
}

async function authRequest(path: string, init?: RequestInit): Promise<{ user: SafeUser }> {
  const res = await fetch(`${API_URL}${path}`, { ...init, credentials: "include" });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw { status: res.status, body } satisfies AuthFailure;
  return body as { user: SafeUser };
}

export async function login(email: string, password: string): Promise<{ user: SafeUser }> {
  return authRequest("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
}

export async function getCurrentUser(): Promise<{ user: SafeUser }> {
  return authRequest("/api/auth/me");
}

export async function logoutUser(): Promise<void> {
  const res = await fetch(`${API_URL}/api/auth/logout`, {
    method: "POST",
    credentials: "include",
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw { status: res.status, body } satisfies AuthFailure;
  }
}

export async function changePassword(
  currentPassword: string,
  newPassword: string,
): Promise<{ user: SafeUser }> {
  // Confirmation is UI-only and is never sent (api-spec §3.4).
  return authRequest("/api/auth/change-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ currentPassword, newPassword }),
  });
}

// Issue #48 — IT Staff Ticket workspace (Lab 3 api-spec §§8–11).
// Staff/Admin session only; Requester receives 403 from the backend.

export interface StaffQueueParams {
  search?: string;
  categoryId?: number;
  requestedPriority?: string;
  itPriority?: string;
  currentStatus?: string;
  owner?: string;
  sort?: string;
  order?: string;
  page?: number;
  pageSize?: number;
}

export interface StaffTicketQueueItem {
  id: number;
  ticketNumber: string;
  ticketDate: string;
  summary: string;
  requester: { id: number; name: string };
  category: { id: number; name: string };
  requestedPriority: string;
  itPriority: string;
  currentStatus: string;
  ticketOwner: { id: number; name: string } | null;
  requesterResolutionIndicatedAt: string | null;
  updatedAt: string;
}

export interface StaffQueueResponse {
  data: StaffTicketQueueItem[];
  meta: TicketListMeta;
}

export interface EligibleOwner {
  id: number;
  name: string;
  role: string;
}

export interface StaffTicketMutation {
  id: number;
  ticketNumber: string;
  currentStatus: string;
  requestedPriority: string;
  itPriority: string;
  ticketOwner: { id: number; name: string; role: string } | null;
  requesterResolutionIndicatedAt: string | null;
  updatedAt: string;
}

export interface StaffTicketDetail extends StaffTicketMutation {
  ticketDate: string;
  requester: { id: number; name: string; email: string };
  category: { id: number; name: string };
  relatedSystem: { id: number; name: string };
  summary: string;
  description: string;
  attachments: Array<{
    id: number;
    originalFilename: string;
    mimeType: string;
    sizeBytes: number;
    removedAt: string | null;
    removedReason: string | null;
    createdAt: string;
  }>;
  createdAt: string;
}

export interface StaffApiFailure {
  status: number;
  body: {
    error?: { code?: string; message?: string };
    fieldErrors?: Record<string, string>;
  } | null;
}

async function staffGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, { credentials: "include" });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw { status: res.status, body } satisfies StaffApiFailure;
  return body as T;
}

async function staffMutate<T>(path: string, method: "POST" | "PATCH", payload: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw { status: res.status, body } satisfies StaffApiFailure;
  return body as T;
}

export async function listStaffTickets(params: StaffQueueParams): Promise<StaffQueueResponse> {
  const qs = new URLSearchParams();
  if (params.search !== undefined) qs.set("search", params.search);
  if (params.categoryId !== undefined) qs.set("categoryId", String(params.categoryId));
  if (params.requestedPriority !== undefined) qs.set("requestedPriority", params.requestedPriority);
  if (params.itPriority !== undefined) qs.set("itPriority", params.itPriority);
  if (params.currentStatus !== undefined) qs.set("currentStatus", params.currentStatus);
  if (params.owner !== undefined) qs.set("owner", params.owner);
  if (params.sort !== undefined) qs.set("sort", params.sort);
  if (params.order !== undefined) qs.set("order", params.order);
  if (params.page !== undefined) qs.set("page", String(params.page));
  if (params.pageSize !== undefined) qs.set("pageSize", String(params.pageSize));
  const suffix = qs.toString();
  return staffGet<StaffQueueResponse>(`/api/staff/tickets${suffix ? `?${suffix}` : ""}`);
}

export async function getStaffTicketDetail(ticketId: number): Promise<StaffTicketDetail> {
  return staffGet<StaffTicketDetail>(`/api/staff/tickets/${ticketId}`);
}

export async function listEligibleOwners(): Promise<{ data: EligibleOwner[] }> {
  return staffGet<{ data: EligibleOwner[] }>("/api/staff/ticket-owners");
}

export async function claimStaffTicket(ticketId: number): Promise<StaffTicketMutation> {
  return staffMutate<StaffTicketMutation>(`/api/staff/tickets/${ticketId}/claim`, "POST", {});
}

export async function assignStaffTicketOwner(
  ticketId: number,
  ownerId: number,
  expectedOwnerId: number | null,
): Promise<StaffTicketMutation> {
  return staffMutate<StaffTicketMutation>(`/api/staff/tickets/${ticketId}/owner`, "PATCH", { ownerId, expectedOwnerId });
}

export async function setStaffTicketPriority(
  ticketId: number,
  itPriority: string,
  expectedItPriority: string,
): Promise<StaffTicketMutation> {
  return staffMutate<StaffTicketMutation>(`/api/staff/tickets/${ticketId}/it-priority`, "PATCH", {
    itPriority,
    expectedItPriority,
  });
}

export async function setStaffTicketStatus(
  ticketId: number,
  status: string,
  expectedCurrentStatus: string,
  ownerId?: number,
): Promise<StaffTicketMutation> {
  return staffMutate<StaffTicketMutation>(`/api/staff/tickets/${ticketId}/status`, "PATCH", {
    status,
    expectedCurrentStatus,
    ...(ownerId === undefined ? {} : { ownerId }),
  });
}
export async function checkSystem(): Promise<SystemStatus> {  // A thrown fetch (network error) or a non-ok HTTP response must surface as a
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

// Issue #49 — Ticket communication (Lab 3 api-spec §§7/12): append-only
// Public Comments (requester + staff on authorized tickets), Internal Notes
// (staff/admin only), and the Requester resolution indication.

export interface CommentAuthor {
  id: number;
  name: string;
  role: string;
}

export interface TicketComment {
  id: number;
  author: CommentAuthor;
  content: string;
  createdAt: string;
}

export interface TicketNote {
  id: number;
  author: CommentAuthor;
  content: string;
  createdAt: string;
}

async function commGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, { credentials: "include" });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw { status: res.status, body } satisfies StaffApiFailure;
  return body as T;
}

async function commPost<T>(path: string, payload: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw { status: res.status, body } satisfies StaffApiFailure;
  return body as T;
}

export async function listTicketComments(ticketId: number): Promise<{ data: TicketComment[] }> {
  return commGet<{ data: TicketComment[] }>(`/api/tickets/${ticketId}/comments`);
}

export async function postTicketComment(ticketId: number, content: string): Promise<TicketComment> {
  return commPost<TicketComment>(`/api/tickets/${ticketId}/comments`, { content });
}

export async function markProblemResolved(ticketId: number): Promise<{ requesterResolutionIndicatedAt: string }> {
  return commPost<{ requesterResolutionIndicatedAt: string }>(
    `/api/tickets/${ticketId}/problem-appears-resolved`,
    {},
  );
}

export async function listTicketNotes(ticketId: number): Promise<{ data: TicketNote[] }> {
  return commGet<{ data: TicketNote[] }>(`/api/staff/tickets/${ticketId}/internal-notes`);
}

export async function postTicketNote(ticketId: number, content: string): Promise<TicketNote> {
  return commPost<TicketNote>(`/api/staff/tickets/${ticketId}/internal-notes`, { content });
}
