import { afterEach, describe, expect, it, vi } from "vitest";
import {
  listTicketActions,
  createTicketAction,
  updateTicketAction,
  completeTicketAction,
  cancelTicketAction,
  listStaffActionEvents,
  listRequesterActionEvents,
} from "../../../api.js";

const actionRow = {
  id: 9,
  ticketId: 7,
  description: "Restarted service",
  result: null,
  recordedBy: { id: 17, name: "Bob Staff" },
  assignedTo: null,
  actionDate: "2026-10-01T08:00:00.000Z",
  followUpRequired: false,
  followUpNote: null,
  attachmentNotes: null,
  status: "PLANNED",
  cycle: 1,
  version: 1,
  createdAt: "2026-10-01T08:00:00.000Z",
  updatedAt: "2026-10-01T08:00:00.000Z",
};

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Actions Taken API mapping (Issue #78, LAP4-01-04/08)", () => {
  it("lists actions with GET /api/tickets/:id/actions", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ actions: [actionRow], meta: { count: 1 } }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await listTicketActions(7);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/tickets/7/actions"),
      expect.objectContaining({ credentials: "include" }),
    );
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0].recordedBy.name).toBe("Bob Staff");
  });

  it("creates with POST + JSON body and surfaces replay state", async () => {
    const payload = { description: "Restarted service", clientRequestId: "11111111-1111-4111-8111-111111111111" };
    const created = vi.fn().mockResolvedValue(jsonResponse(actionRow, 201));
    vi.stubGlobal("fetch", created);
    const first = await createTicketAction(7, payload);
    const [url, init] = created.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/api/staff/tickets/7/actions");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toMatchObject(payload);
    expect(first.replayed).toBe(false);
    expect(first.action.id).toBe(9);

    const replayed = vi.fn().mockResolvedValue(jsonResponse(actionRow, 200, { "Idempotent-Replayed": "true" }));
    vi.stubGlobal("fetch", replayed);
    const second = await createTicketAction(7, payload);
    expect(second.replayed).toBe(true);
    expect(second.action.id).toBe(9);
  });

  it("updates with PUT /api/staff/actions/:id", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ...actionRow, version: 2 }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await updateTicketAction(9, { expectedVersion: 1, status: "IN_PROGRESS" });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/api/staff/actions/9");
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body as string)).toMatchObject({ expectedVersion: 1 });
    expect(result.version).toBe(2);
  });

  it("completes and cancels with POST subpaths", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ...actionRow, status: "COMPLETED", version: 3 }));
    vi.stubGlobal("fetch", fetchMock);
    await completeTicketAction(9, { expectedVersion: 2, result: "Fixed." });
    const [doneUrl, doneInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(doneUrl).toContain("/api/staff/actions/9/complete");
    expect(doneInit.method).toBe("POST");
    await cancelTicketAction(9, { expectedVersion: 1 });
    const [cancelUrl, cancelInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(cancelUrl).toContain("/api/staff/actions/9/cancel");
    expect(cancelInit.method).toBe("POST");
  });

  it("reads history from role-scoped event endpoints", async () => {
    const events = { events: [{ id: 1, actionTakenId: 9, eventType: "CREATED", actor: { id: 17, name: "Bob Staff" }, occurredAt: "2026-10-01T08:00:00.000Z", payload: {}, requestId: "r1" }] };
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(jsonResponse(events)));
    vi.stubGlobal("fetch", fetchMock);
    const staff = await listStaffActionEvents(9);
    expect(fetchMock.mock.calls[0][0] as string).toContain("/api/staff/actions/9/events");
    expect(staff.events).toHaveLength(1);
    const req = await listRequesterActionEvents(7, 9);
    expect(fetchMock.mock.calls[1][0] as string).toContain("/api/tickets/7/actions/9/events");
    expect(req.events[0].eventType).toBe("CREATED");
  });

  it("throws status + body on API failure", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ error: { code: "ACTION_STATE_CHANGED", message: "Stale." } }, 409));
    vi.stubGlobal("fetch", fetchMock);
    await expect(listTicketActions(999)).rejects.toMatchObject({ status: 409 });
  });
});
