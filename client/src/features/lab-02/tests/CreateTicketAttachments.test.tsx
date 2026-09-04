import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import CreateTicket from "../../../pages/CreateTicket";
import * as api from "../../../api.js";
import { RequesterProvider } from "../../../contexts/RequesterContext.js";

vi.mock("../../../api.js");

const requester = { id: 41, name: "Issue 27 Requester", email: "issue27-ui@test.local" };
const categories = [{ id: 11, name: "Hardware" }];
const systems = [{ id: 21, name: "Email" }];

function renderCreateTicket() {
  return render(
    <MemoryRouter initialEntries={["/create"]}>
      <RequesterProvider>
        <Routes>
          <Route path="/create" element={<CreateTicket />} />
        </Routes>
      </RequesterProvider>
    </MemoryRouter>,
  );
}

function mockReferenceData() {
  vi.spyOn(api, "fetchCategories").mockResolvedValue(categories);
  vi.spyOn(api, "fetchRelatedSystems").mockResolvedValue(systems);
}

async function fillValidForm() {
  await waitFor(() => expect(screen.getByRole("option", { name: "Hardware" })).toBeInTheDocument());
  await userEvent.selectOptions(screen.getByLabelText(/Category/i), "11");
  await userEvent.selectOptions(screen.getByLabelText(/Related System/i), "21");
  fireEvent.change(screen.getByLabelText(/Summary/i), {
    target: { value: "Laptop battery drains quickly" },
  });
  fireEvent.change(screen.getByLabelText(/Description/i), {
    target: { value: "Battery drops quickly during normal office use." },
  });
}

function createdTicket(id: number, ticketNumber: string) {
  return {
    id,
    ticketNumber,
    currentStatus: "NEW",
    requestedPriority: "MEDIUM",
    summary: "Laptop battery drains quickly",
    description: "Battery drops quickly during normal office use.",
    category: categories[0],
    relatedSystem: systems[0],
    requester,
    attachments: [],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  localStorage.setItem("toktickit.requester", JSON.stringify(requester));
});

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("Create Ticket attachment evidence", () => {
  it("UI-12 / AC-23 keeps the created Ticket after an initial upload fails and exposes retry from Ticket Detail", async () => {
    mockReferenceData();
    const createSpy = vi.spyOn(api, "createTicket").mockResolvedValue(createdTicket(501, "2609-0501"));
    const uploadSpy = vi.spyOn(api, "uploadAttachment").mockRejectedValue({
      status: 415,
      body: { error: { code: "UNSUPPORTED_MEDIA_TYPE", message: "Upload service rejected the file" } },
    });

    renderCreateTicket();
    await fillValidForm();

    const validFile = new File(["png-bytes"], "evidence.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText("Choose files"), { target: { files: [validFile] } });

    await userEvent.click(screen.getByRole("button", { name: "Submit Ticket" }));

    expect(await screen.findByText("Ticket created successfully")).toBeInTheDocument();
    expect(screen.getByText("2609-0501")).toBeInTheDocument();
    expect(createSpy).toHaveBeenCalledTimes(1);
    expect(uploadSpy).toHaveBeenCalledTimes(1);
    expect(uploadSpy).toHaveBeenCalledWith(501, requester.id, expect.objectContaining({ name: "evidence.png" }));
    expect(screen.getByText(/evidence\.png — failed \(Upload service rejected the file\)/)).toBeInTheDocument();

    const retry = screen.getByRole("link", { name: "Retry from Ticket Detail" });
    expect(retry).toHaveAttribute("href", "/tickets/501");
    expect(screen.getByRole("link", { name: "View Ticket Detail" })).toHaveAttribute("href", "/tickets/501");
  });

  it("UI-13 / AC-19 keeps an invalid selected file local, explains the rejection, and never uploads it", async () => {
    mockReferenceData();
    vi.spyOn(api, "createTicket").mockResolvedValue(createdTicket(502, "2609-0502"));
    const uploadSpy = vi.spyOn(api, "uploadAttachment").mockResolvedValue({ id: 900 } as any);

    renderCreateTicket();
    await fillValidForm();

    const invalidFile = new File(["plain text"], "notes.txt", { type: "text/plain" });
    fireEvent.change(screen.getByLabelText("Choose files"), { target: { files: [invalidFile] } });

    expect(screen.getByText(/notes\.txt — File type not allowed/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Dismiss" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Submit Ticket" }));

    expect(await screen.findByText("Ticket created successfully")).toBeInTheDocument();
    expect(uploadSpy).not.toHaveBeenCalled();
  });
});
