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

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function renderCreateTicket() {
  return render(
    <MemoryRouter initialEntries={["/create"]}>
      <RequesterProvider>
        <Routes>
          <Route path="/create" element={<CreateTicket />} />
          <Route path="/my-tickets" element={<div>My Tickets destination</div>} />
        </Routes>
      </RequesterProvider>
    </MemoryRouter>
  );
}

function mockReferenceData() {
  vi.spyOn(api, "fetchCategories").mockResolvedValue(categories);
  vi.spyOn(api, "fetchRelatedSystems").mockResolvedValue(systems);
}

async function waitForReferenceData() {
  await waitFor(() => expect(screen.getByRole("option", { name: "Hardware" })).toBeInTheDocument());
  expect(screen.getByRole("option", { name: "Email" })).toBeInTheDocument();
}

async function fillValidForm() {
  await waitForReferenceData();
  await userEvent.selectOptions(screen.getByLabelText(/Category/i), "11");
  await userEvent.selectOptions(screen.getByLabelText(/Related System/i), "21");
  fireEvent.change(screen.getByLabelText(/Summary/i), {
    target: { value: "Laptop battery drains quickly" },
  });
  fireEvent.change(screen.getByLabelText(/Description/i), {
    target: { value: "Battery drops quickly during normal office use." },
  });
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

describe("CreateTicket (Lab 2 Issue 8A)", () => {
  it("UI-26 shows Back to My Tickets in the heading and navigation does not submit", async () => {
    mockReferenceData();
    const createSpy = vi.spyOn(api, "createTicket").mockResolvedValue({});
    renderCreateTicket();
    await waitForReferenceData();

    const heading = screen.getByRole("heading", { name: "Create Ticket" });
    const back = screen.getByRole("link", { name: "Back to My Tickets" });
    expect(back).toHaveAttribute("href", "/my-tickets");
    const headingRow = back.closest(".lab2-screen-heading");
    expect(headingRow).toContainElement(heading);
    expect(headingRow).toHaveClass("justify-content-between", "align-items-center", "lab2-mobile-stack");

    const submit = screen.getByRole("button", { name: "Submit Ticket" });
    const clear = screen.getByRole("button", { name: "Clear" });
    expect(submit).toBeInTheDocument();
    expect(clear).toBeInTheDocument();
    expect(submit.parentElement).toContainElement(clear);
    expect(submit.parentElement).not.toContainElement(back);
    await userEvent.click(back);

    expect(await screen.findByText("My Tickets destination")).toBeInTheDocument();
    expect(createSpy).not.toHaveBeenCalled();
  });

  it.each([
    ["short", "abcd"],
    ["long", "x".repeat(121)],
  ])("UI-01 / AC-02 shows summary field error for %s input and does not submit", async (_caseName, summary) => {
    mockReferenceData();
    const createSpy = vi.spyOn(api, "createTicket").mockResolvedValue({});
    renderCreateTicket();
    await waitForReferenceData();

    await userEvent.selectOptions(screen.getByLabelText(/Category/i), "11");
    await userEvent.selectOptions(screen.getByLabelText(/Related System/i), "21");
    fireEvent.change(screen.getByLabelText(/Summary/i), { target: { value: summary } });
    fireEvent.change(screen.getByLabelText(/Description/i), {
      target: { value: "This description is definitely long enough." },
    });
    await userEvent.click(screen.getByRole("button", { name: "Submit Ticket" }));

    expect(screen.getByText("Summary must contain 5–120 characters.")).toBeInTheDocument();
    expect(createSpy).not.toHaveBeenCalled();
  });

  it.each([
    ["short", "x".repeat(19)],
    ["long", "x".repeat(2001)],
  ])("UI-02 / AC-03 shows description field error for %s input and does not submit", async (_caseName, description) => {
    mockReferenceData();
    const createSpy = vi.spyOn(api, "createTicket").mockResolvedValue({});
    renderCreateTicket();
    await waitForReferenceData();

    await userEvent.selectOptions(screen.getByLabelText(/Category/i), "11");
    await userEvent.selectOptions(screen.getByLabelText(/Related System/i), "21");
    fireEvent.change(screen.getByLabelText(/Summary/i), { target: { value: "Valid summary" } });
    fireEvent.change(screen.getByLabelText(/Description/i), { target: { value: description } });
    await userEvent.click(screen.getByRole("button", { name: "Submit Ticket" }));

    expect(screen.getByText("Description must contain 20–2,000 characters.")).toBeInTheDocument();
    expect(createSpy).not.toHaveBeenCalled();
  });

  it("UI-03 / UI-18 / AC-05 keeps Submit busy and disabled and sends exactly one request", async () => {
    mockReferenceData();
    const pending = deferred<any>();
    const createSpy = vi.spyOn(api, "createTicket").mockReturnValue(pending.promise);
    renderCreateTicket();
    await fillValidForm();

    await userEvent.click(screen.getByRole("button", { name: "Submit Ticket" }));

    const busyButton = await screen.findByRole("button", { name: /Submitting/i });
    expect(busyButton).toBeDisabled();
    expect(createSpy).toHaveBeenCalledTimes(1);

    fireEvent.click(busyButton);
    expect(createSpy).toHaveBeenCalledTimes(1);

    pending.resolve({
      id: 101,
      ticketNumber: "2609-0101",
      currentStatus: "NEW",
      requestedPriority: "MEDIUM",
      summary: "Laptop battery drains quickly",
      description: "Battery drops quickly during normal office use.",
      category: categories[0],
      relatedSystem: systems[0],
      requester,
      attachments: [],
    });
    await screen.findByText("Ticket created successfully");
  });

  it("UI-04 / AC-26 shows a safe submission error and preserves all entered values", async () => {
    mockReferenceData();
    vi.spyOn(api, "createTicket").mockRejectedValue({
      status: 500,
      body: { error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred. Please try again." } },
    });
    renderCreateTicket();
    await fillValidForm();
    await userEvent.selectOptions(screen.getByLabelText(/Requested Priority/i), "HIGH");

    await userEvent.click(screen.getByRole("button", { name: "Submit Ticket" }));

    await screen.findByText("An unexpected error occurred. Please try again.");
    expect(screen.getByLabelText(/Category/i)).toHaveValue("11");
    expect(screen.getByLabelText(/Related System/i)).toHaveValue("21");
    expect(screen.getByLabelText(/Requested Priority/i)).toHaveValue("HIGH");
    expect(screen.getByLabelText(/Summary/i)).toHaveValue("Laptop battery drains quickly");
    expect(screen.getByLabelText(/Description/i)).toHaveValue("Battery drops quickly during normal office use.");
  });

  it("UI-05 / AC-01 renders the official Ticket Number returned by the backend", async () => {
    mockReferenceData();
    vi.spyOn(api, "createTicket").mockResolvedValue({
      id: 102,
      ticketNumber: "2609-0102",
      currentStatus: "NEW",
      requestedPriority: "MEDIUM",
      summary: "Laptop battery drains quickly",
      description: "Battery drops quickly during normal office use.",
      category: categories[0],
      relatedSystem: systems[0],
      requester,
      attachments: [],
    });
    renderCreateTicket();
    await fillValidForm();

    await userEvent.click(screen.getByRole("button", { name: "Submit Ticket" }));

    expect(await screen.findByText("Ticket created successfully")).toBeInTheDocument();
    expect(screen.getByText("2609-0102")).toBeInTheDocument();
    expect(screen.getByText(/Official Ticket Number:/i)).toBeInTheDocument();
  });

  it("UI-22 / AC-25 keeps reference controls disabled during loading/failure, preserves text, and retries", async () => {
    const firstCategories = deferred<typeof categories>();
    const categorySpy = vi
      .spyOn(api, "fetchCategories")
      .mockImplementationOnce(() => firstCategories.promise)
      .mockResolvedValueOnce(categories);
    const systemSpy = vi.spyOn(api, "fetchRelatedSystems").mockResolvedValue(systems);
    renderCreateTicket();

    expect(screen.getByText("Loading reference data…")).toBeInTheDocument();
    expect(screen.getByLabelText(/Category/i)).toBeDisabled();
    expect(screen.getByLabelText(/Related System/i)).toBeDisabled();
    expect(screen.getByRole("button", { name: "Submit Ticket" })).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/Summary/i), { target: { value: "Keep this summary" } });
    fireEvent.change(screen.getByLabelText(/Description/i), {
      target: { value: "Keep this description while refs fail." },
    });

    firstCategories.reject(new Error("Reference data unavailable"));
    await screen.findByText("Reference data unavailable");

    expect(screen.getByLabelText(/Category/i)).toBeDisabled();
    expect(screen.getByLabelText(/Related System/i)).toBeDisabled();
    expect(screen.getByRole("button", { name: "Submit Ticket" })).toBeDisabled();
    expect(screen.getByLabelText(/Summary/i)).toHaveValue("Keep this summary");
    expect(screen.getByLabelText(/Description/i)).toHaveValue("Keep this description while refs fail.");

    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(screen.getByRole("option", { name: "Hardware" })).toBeInTheDocument());
    expect(screen.getByLabelText(/Category/i)).toBeEnabled();
    expect(screen.getByLabelText(/Related System/i)).toBeEnabled();
    expect(categorySpy).toHaveBeenCalledTimes(2);
    expect(systemSpy).toHaveBeenCalledTimes(2);
    expect(screen.getByLabelText(/Summary/i)).toHaveValue("Keep this summary");
    expect(screen.getByLabelText(/Description/i)).toHaveValue("Keep this description while refs fail.");
  });
});
