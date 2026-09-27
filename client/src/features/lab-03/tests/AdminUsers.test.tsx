import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import AdminUsers from "../../../pages/AdminUsers.js";
import AdminUserCreate from "../../../pages/AdminUserCreate.js";
import AdminUserEdit from "../../../pages/AdminUserEdit.js";
import AdminUserPassword from "../../../pages/AdminUserPassword.js";
import * as api from "../../../api.js";

vi.mock("../../../api.js");

const mockedApi = vi.mocked(api);

const users = [
  { id: 12, name: "Alice Example", email: "alice@example.com", role: "REQUESTER", active: true, mustChangePassword: false, createdAt: "2026-09-01T08:00:00.000Z" },
  { id: 17, name: "Bob Staff", email: "bob@example.com", role: "IT_STAFF", active: true, mustChangePassword: false, createdAt: "2026-09-01T08:00:00.000Z" },
  { id: 22, name: "Nok Inactive", email: "nok@example.com", role: "IT_STAFF", active: false, mustChangePassword: false, createdAt: "2026-09-01T08:00:00.000Z" },
];

function renderList() {
  return render(
    <MemoryRouter initialEntries={["/admin/users"]}>
      <Routes>
        <Route path="/admin/users" element={<AdminUsers />} />
        <Route path="/admin/users/new" element={<div>Create destination</div>} />
        <Route path="/admin/users/:id" element={<div>Edit destination</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedApi.listUsers.mockResolvedValue({ data: users });
});

describe("AdminUsers list (Lab 3 Issue #50, UI-10)", () => {
  it("renders Name/Email/Role/Status columns with no Edit column and search plus optional role filter", async () => {
    renderList();
    expect((await screen.findAllByText("alice@example.com")).length).toBeGreaterThanOrEqual(1);

    const table = screen.getByRole("table");
    // Contract columns exactly (Path C: ID column / Status filter /
    // pagination removed — they live on in the follow-up issue).
    const headers = within(table).getAllByRole("columnheader").map((h) => h.textContent);
    expect(headers).toEqual(["Name", "Email", "Role", "Status"]);
    for (const col of ["Name", "Email", "Role", "Status"]) {
      expect(within(table).getByText(col)).toBeInTheDocument();
    }
    expect(within(table).queryByText("Edit")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();

    expect(screen.getByLabelText("Search")).toBeInTheDocument();
    expect(screen.getByLabelText("Role")).toBeInTheDocument();
    // Status is displayed but is not a list filter (contract).
    expect(screen.queryByLabelText("Status")).not.toBeInTheDocument();
    expect((await screen.findAllByText("ACTIVE")).length).toBeGreaterThanOrEqual(1);
    expect((await screen.findAllByText("INACTIVE")).length).toBeGreaterThanOrEqual(1);

    expect(screen.getByRole("button", { name: "Clear Filters" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Refresh" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Create User" })).toHaveAttribute("href", "/admin/users/new");
  });

  it("desktop row opens Edit directly and is keyboard-operable", async () => {
    const user = userEvent.setup();
    renderList();
    await screen.findAllByText("alice@example.com");

    const row = within(screen.getByRole("table")).getByText("Alice Example").closest("tr")!;
    expect(row).toHaveAttribute("tabindex", "0");
    row.focus();
    await user.keyboard("{Enter}");
    expect(await screen.findByText("Edit destination")).toBeInTheDocument();
  });

  it("search narrows by name or email and role filter is optional", async () => {
    const user = userEvent.setup();
    renderList();
    await screen.findAllByText("alice@example.com");

    await user.type(screen.getByLabelText(/Search/), "bob");
    await waitFor(() => expect(mockedApi.listUsers).toHaveBeenLastCalledWith(expect.objectContaining({ search: "bob" })));

    await user.selectOptions(screen.getByLabelText(/Role/), "IT_STAFF");
    expect(mockedApi.listUsers).toHaveBeenLastCalledWith(expect.objectContaining({ role: "IT_STAFF" }));
  });

  it("forbidden users see a forbidden message instead of the list", async () => {
    mockedApi.listUsers.mockRejectedValue({ status: 403, body: { error: { code: "FORBIDDEN" } } });
    renderList();
    expect(await screen.findByText("You do not have permission to manage users.")).toBeInTheDocument();
  });
});

describe("AdminUsers create/edit/reset (Lab 3 Issue #50, UI-10/11)", () => {
  function renderCreate() {
    return render(
      <MemoryRouter initialEntries={["/admin/users/new"]}>
        <Routes>
          <Route path="/admin/users/new" element={<AdminUserCreate />} />
        </Routes>
      </MemoryRouter>,
    );
  }

  function renderEdit() {
    mockedApi.listUsers.mockResolvedValue({ data: users });
    return render(
      <MemoryRouter initialEntries={["/admin/users/17"]}>
        <Routes>
          <Route path="/admin/users/:id" element={<AdminUserEdit />} />
          <Route path="/admin/users/:id/initial-password" element={<div>Reset destination</div>} />
          <Route path="/admin/users" element={<div>List destination</div>} />
        </Routes>
      </MemoryRouter>,
    );
  }

  function renderPassword() {
    return render(
      <MemoryRouter initialEntries={["/admin/users/17/initial-password"]}>
        <Routes>
          <Route path="/admin/users/:id/initial-password" element={<AdminUserPassword />} />
        </Routes>
      </MemoryRouter>,
    );
  }

  it("create form requires fields, toggles password visibility, and never echoes the secret", async () => {
    const user = userEvent.setup();
    renderCreate();
    expect(screen.getByLabelText(/Name/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Email/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Role/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Active/)).toBeInTheDocument();
    const password = screen.getByLabelText(/Initial Password/);
    expect(password).toHaveAttribute("type", "password");
    await user.click(screen.getByRole("button", { name: "Show initial password" }));
    expect(password).toHaveAttribute("type", "text");

    mockedApi.createUser.mockResolvedValue({ ...users[1], mustChangePassword: true });
    await user.type(screen.getByLabelText(/Name/), "New Staff");
    await user.type(screen.getByLabelText(/Email/), "new@example.com");
    await user.selectOptions(screen.getByLabelText(/Role/), "IT_STAFF");
    await user.type(password, "Create-Valid-9!");
    await user.click(screen.getByRole("button", { name: "Create User" }));
    expect(mockedApi.createUser).toHaveBeenCalledWith({
      name: "New Staff",
      email: "new@example.com",
      role: "IT_STAFF",
      active: true,
      initialPassword: "Create-Valid-9!",
    });
    expect(screen.queryByDisplayValue("Create-Valid-9!")).not.toBeInTheDocument();
  });

  it("edit Active is a minimal switch preserving behavior and input", async () => {
    const user = userEvent.setup();
    renderEdit();
    await screen.findByDisplayValue("Bob Staff");

    // Minimal toggle/switch control (not a plain checkbox).
    const toggle = screen.getByRole("switch", { name: "Active" });
    expect(toggle).toBeChecked();
    await user.click(toggle);
    expect(toggle).not.toBeChecked();
    expect(screen.getByText("Inactive")).toBeInTheDocument();
  });

  it("edit form saves changes and surfaces safety conflicts actionably", async () => {
    const user = userEvent.setup();
    renderEdit();
    await screen.findByDisplayValue("Bob Staff");

    // Breadcrumb per the approved mockup.
    const breadcrumb = screen.getByRole("navigation", { name: "Breadcrumb" });
    expect(within(breadcrumb).getByRole("link", { name: "User Management" })).toHaveAttribute("href", "/admin/users");

    mockedApi.updateUser.mockResolvedValue({ ...users[1], name: "Bob Renamed" });
    await user.clear(screen.getByLabelText(/Name/));
    await user.type(screen.getByLabelText(/Name/), "Bob Renamed");
    await user.click(screen.getByRole("button", { name: "Save Changes" }));
    expect(mockedApi.updateUser).toHaveBeenCalledWith(17, expect.objectContaining({ name: "Bob Renamed" }));

    mockedApi.updateUser.mockRejectedValueOnce({
      status: 409,
      body: { error: { code: "USER_HAS_ACTIVE_TICKETS", message: "Reassign this user's active tickets before changing the role or deactivating the account." } },
    });
    await user.click(screen.getByLabelText(/Active/));
    await user.click(screen.getByRole("button", { name: "Save Changes" }));
    expect(await screen.findByText("Reassign this user's active tickets before changing the role or deactivating the account.")).toBeInTheDocument();
    // Edit input is preserved for correction, not wiped.
    expect(screen.getByLabelText(/Name/)).toHaveValue("Bob Renamed");
  });

  it("reset form requires policy password with confirmation and shows the mandatory-change notice", async () => {
    const user = userEvent.setup();
    mockedApi.setInitialPassword.mockResolvedValue(undefined);
    mockedApi.listUsers.mockResolvedValue({ data: users });
    renderPassword();

    // Three-level breadcrumb and user subtitle per the mockup.
    const breadcrumb = screen.getByRole("navigation", { name: "Breadcrumb" });
    expect(within(breadcrumb).getByText("Set New Initial Password")).toBeInTheDocument();
    expect(await screen.findByText("Bob Staff · bob@example.com")).toBeInTheDocument();
    // Password rule checklist mirrors the mockup.
    expect(screen.getByText("8–64 characters")).toBeInTheDocument();

    const next = screen.getByLabelText(/New Initial Password/);
    await user.click(screen.getByRole("button", { name: "Show new initial password" }));
    expect(next).toHaveAttribute("type", "text");
    await user.type(next, "Reset-New-9!");
    await user.type(screen.getByLabelText(/Confirm Password/), "Reset-New-9!");
    await user.click(screen.getByRole("button", { name: "Set Password" }));
    expect(mockedApi.setInitialPassword).toHaveBeenCalledWith(17, "Reset-New-9!");
    expect(await screen.findByText("Initial password updated. The user must change it at next sign-in.")).toBeInTheDocument();
  });
});
