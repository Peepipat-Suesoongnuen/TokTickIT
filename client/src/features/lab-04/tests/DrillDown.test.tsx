import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import StaffQueue from "../../../pages/StaffQueue.js";
import MyTickets from "../../../pages/MyTickets.js";
import AdminUsers from "../../../pages/AdminUsers.js";
import * as api from "../../../api.js";

vi.mock("../../../api.js");
const mockedApi = vi.mocked(api);

// Issue #80 (Lab 4) — Drill-down contract (UI-05, C-80-07/C-80-08).
// Evidence-closure for the query-init implemented in BUILD:
// lists initialize filters/sort from the URL (dashboard card targets),
// unknown values fall back to safe defaults (never forwarded), and the
// client forwards the exact drill-down values the API metrics were
// computed from (metric ≡ destination, client half; server half is API-23).
// Production change that fails each test: removing the corresponding
// useSearchParams initializer (or forwarding raw params without validation).

const staffPage = {
  data: [],
  meta: { page: 1, pageSize: 10, totalCount: 0, totalPages: 0, hasNextPage: false, hasPreviousPage: false },
};

const myPage = {
  data: [],
  meta: { page: 1, pageSize: 10, totalCount: 0, totalPages: 0, hasNextPage: false, hasPreviousPage: false },
};

beforeEach(() => {
  vi.clearAllMocks();
  mockedApi.listStaffTickets.mockResolvedValue(staffPage);
  mockedApi.fetchCategories.mockResolvedValue([]);
  mockedApi.listEligibleOwners.mockResolvedValue({ data: [] });
  mockedApi.listTickets.mockResolvedValue(myPage);
});

describe("Drill-down query-init (Issue #80, UI-05)", () => {
  it("StaffQueue forwards dashboard assignee + CSV itPriority drill-down values", async () => {
    render(
      <MemoryRouter initialEntries={["/staff/queue?assignee=me&itPriority=HIGH,CRITICAL"]}>
        <StaffQueue />
      </MemoryRouter>,
    );
    await waitFor(() =>
      expect(mockedApi.listStaffTickets).toHaveBeenCalledWith(
        expect.objectContaining({ assignee: "me", itPriority: "HIGH,CRITICAL" }),
      ),
    );
  });

  it("StaffQueue initializes owner/sort/order/status from query", async () => {
    render(
      <MemoryRouter initialEntries={["/staff/queue?owner=me&sort=updatedAt&order=asc&currentStatus=OPEN"]}>
        <StaffQueue />
      </MemoryRouter>,
    );
    await waitFor(() =>
      expect(mockedApi.listStaffTickets).toHaveBeenCalledWith(
        expect.objectContaining({ owner: "me", sort: "updatedAt", order: "asc", currentStatus: "OPEN" }),
      ),
    );
  });

  it("StaffQueue ignores bogus query values (safe defaults, never forwarded)", async () => {
    render(
      <MemoryRouter initialEntries={["/staff/queue?assignee=bogus&itPriority=BANANA&owner=nope&sort=hack&order=sideways"]}>
        <StaffQueue />
      </MemoryRouter>,
    );
    await screen.findByText("Ticket Queue");
    const calls = mockedApi.listStaffTickets.mock.calls.map((c) => c[0] as Record<string, unknown>);
    expect(calls.length).toBeGreaterThan(0);
    for (const params of calls) {
      expect(params.assignee).toBeUndefined();
      expect(params.itPriority).toBeUndefined();
      expect(params.owner).toBeUndefined();
      expect(params.sort).toBeUndefined();
    }
  });

  it("MyTickets initializes ?state= drill-down sets (open/resolved)", async () => {
    const { unmount } = render(
      <MemoryRouter initialEntries={["/my-tickets?state=open"]}>
        <MyTickets />
      </MemoryRouter>,
    );
    await waitFor(() =>
      expect(mockedApi.listTickets).toHaveBeenCalledWith(expect.objectContaining({ state: "open" })),
    );
    unmount();
    vi.clearAllMocks();
    mockedApi.listTickets.mockResolvedValue(myPage);
    mockedApi.fetchCategories.mockResolvedValue([]);
    render(
      <MemoryRouter initialEntries={["/my-tickets?state=resolved"]}>
        <MyTickets />
      </MemoryRouter>,
    );
    await waitFor(() =>
      expect(mockedApi.listTickets).toHaveBeenCalledWith(expect.objectContaining({ state: "resolved" })),
    );
  });

  it("MyTickets initializes ?status= waiting drill-down and ignores bogus ?state=", async () => {
    render(
      <MemoryRouter initialEntries={["/my-tickets?status=WAITING_FOR_REQUESTER"]}>
        <MyTickets />
      </MemoryRouter>,
    );
    await waitFor(() =>
      expect(mockedApi.listTickets).toHaveBeenCalledWith(
        expect.objectContaining({ currentStatus: "WAITING_FOR_REQUESTER" }),
      ),
    );
  });

  it("MyTickets never forwards bogus ?state= values", async () => {
    render(
      <MemoryRouter initialEntries={["/my-tickets?state=weird"]}>
        <MyTickets />
      </MemoryRouter>,
    );
    await screen.findByText("My Tickets");
    const calls = mockedApi.listTickets.mock.calls.map((c) => c[0] as Record<string, unknown>);
    expect(calls.length).toBeGreaterThan(0);
    for (const params of calls) {
      expect(params.state).toBeUndefined();
    }
  });

  it("StaffQueue forwards ?state=open drill-down scope (D-80-09)", async () => {
    render(
      <MemoryRouter initialEntries={["/staff/queue?itPriority=HIGH,CRITICAL&state=open"]}>
        <StaffQueue />
      </MemoryRouter>,
    );
    await waitFor(() =>
      expect(mockedApi.listStaffTickets).toHaveBeenCalledWith(
        expect.objectContaining({ itPriority: "HIGH,CRITICAL", state: "open" }),
      ),
    );
  });

  it("StaffQueue ignores bogus ?state= values", async () => {
    render(
      <MemoryRouter initialEntries={["/staff/queue?state=weird"]}>
        <StaffQueue />
      </MemoryRouter>,
    );
    await screen.findByText("Ticket Queue");
    const calls = mockedApi.listStaffTickets.mock.calls.map((c) => c[0] as Record<string, unknown>);
    expect(calls.length).toBeGreaterThan(0);
    for (const params of calls) {
      expect(params.state).toBeUndefined();
    }
  });

  it("AdminUsers initializes ?role= filter from query (ui-spec:64)", async () => {
    mockedApi.listUsers.mockResolvedValue({ data: [] });
    render(
      <MemoryRouter initialEntries={["/admin/users?role=IT_STAFF"]}>
        <AdminUsers />
      </MemoryRouter>,
    );
    await waitFor(() =>
      expect(mockedApi.listUsers).toHaveBeenCalledWith(expect.objectContaining({ role: "IT_STAFF" })),
    );
  });

  it("AdminUsers ignores bogus ?role= values", async () => {
    mockedApi.listUsers.mockResolvedValue({ data: [] });
    render(
      <MemoryRouter initialEntries={["/admin/users?role=BOGUS"]}>
        <AdminUsers />
      </MemoryRouter>,
    );
    await screen.findByText("User Management");
    const calls = mockedApi.listUsers.mock.calls.map((c) => c[0] as Record<string, unknown>);
    expect(calls.length).toBeGreaterThan(0);
    for (const params of calls) {
      expect(params.role).toBeUndefined();
    }
  });
});
