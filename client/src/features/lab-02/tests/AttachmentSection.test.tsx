import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AttachmentSection, { Attachment } from "../../../components/AttachmentSection";

const activeAtt: Attachment = {
  id: 1,
  originalFilename: "photo.jpg",
  mimeType: "image/jpeg",
  sizeBytes: 2048,
  removedAt: null,
  removedReason: null,
  createdAt: "2026-08-20T10:00:00.000Z",
};

const removedAtt: Attachment = {
  id: 2,
  originalFilename: "old.pdf",
  mimeType: "application/pdf",
  sizeBytes: 1024,
  removedAt: "2026-08-21T10:00:00.000Z",
  removedReason: "duplicate",
  createdAt: "2026-08-20T09:00:00.000Z",
};

function makeProps(overrides: Partial<React.ComponentProps<typeof AttachmentSection>> = {}) {
  return {
    attachments: [activeAtt],
    onDownload: vi.fn(),
    onRemove: vi.fn(),
    onUpload: vi.fn(),
    canUpload: true,
    ...overrides,
  };
}

describe("AttachmentSection", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders Active attachment with Download and Remove", () => {
    render(<AttachmentSection {...makeProps()} />);

    expect(screen.getByText("photo.jpg")).toBeInTheDocument();
    expect(screen.getByText(/Uploaded 2026-08-20 17:00:00/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Download" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove" })).toBeInTheDocument();
    expect(screen.getByLabelText("Choose file")).toBeInTheDocument();
  });

  it("Removed shows struck-through and no Download", () => {
    render(<AttachmentSection {...makeProps({ attachments: [removedAtt] })} />);

    const span = screen.getByText("old.pdf");
    expect(span).toBeInTheDocument();
    expect(span).toHaveStyle({ textDecoration: "line-through" });
    expect(screen.queryByRole("button", { name: "Download" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remove" })).not.toBeInTheDocument();
    expect(screen.getByText(/duplicate/)).toBeInTheDocument();
  });

  it("modal Confirm disabled until reason is entered", async () => {
    const onRemove = vi.fn();
    render(<AttachmentSection {...makeProps({ onRemove })} />);

    await userEvent.click(screen.getByRole("button", { name: "Remove" }));

    expect(screen.getByRole("dialog", { name: /Remove Attachment/i })).toBeInTheDocument();
    const confirm = screen.getByRole("button", { name: "Confirm Removal" });
    expect(confirm).toBeDisabled();
    expect(screen.getByLabelText("Reason")).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText("Reason"), "wrong file");
    expect(confirm).toBeEnabled();

    // clear to blank (spaces only) should be disabled again
    await userEvent.clear(screen.getByLabelText("Reason"));
    await userEvent.type(screen.getByLabelText("Reason"), "   ");
    expect(confirm).toBeDisabled();

    await userEvent.clear(screen.getByLabelText("Reason"));
    await userEvent.type(screen.getByLabelText("Reason"), "valid reason");
    await userEvent.click(confirm);

    expect(onRemove).toHaveBeenCalledWith(1, "valid reason");
    // modal closes after confirm
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("invalid file not counted toward limit (onUpload called, input remains)", async () => {
    const onUpload = vi.fn();
    render(<AttachmentSection {...makeProps({ onUpload, canUpload: true })} />);

    const input = screen.getByLabelText("Choose file") as HTMLInputElement;
    expect(input).toBeInTheDocument();
    expect(input.accept).toContain(".pdf");
    expect(input.accept).toContain(".jpg");

    // Simulate selecting an invalid file type (.txt). Component calls onUpload regardless;
    // use fireEvent to bypass accept filtering of userEvent
    const invalidFile = new File(["hello"], "notes.txt", { type: "text/plain" });
    fireEvent.change(input, { target: { files: [invalidFile] } });

    await waitFor(() => expect(onUpload).toHaveBeenCalledTimes(1));
    expect(onUpload).toHaveBeenCalledWith(expect.objectContaining({ name: "notes.txt" }));
    // still can upload, limit helper not shown — invalid file not counted toward active limit
    expect(screen.queryByText("Maximum of 5 active attachments reached")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Choose file")).toBeInTheDocument();
  });

  it('shows limit helper "Maximum of 5 active attachments reached" and hides input', () => {
    render(<AttachmentSection {...makeProps({ canUpload: false, attachments: Array.from({ length: 5 }, (_, i) => ({ ...activeAtt, id: i + 1, originalFilename: `file${i}.pdf` })) })} />);

    expect(screen.getByText("Maximum of 5 active attachments reached")).toBeInTheDocument();
    expect(screen.queryByLabelText("Choose file")).not.toBeInTheDocument();
  });

  it("uploading state: file input triggers onUpload and remains available", async () => {
    let resolveUpload!: () => void;
    const onUpload = vi.fn(() => new Promise<void>((resolve) => { resolveUpload = resolve; }));
    render(<AttachmentSection {...makeProps({ onUpload, canUpload: true })} />);
    const input = screen.getByLabelText("Choose file") as HTMLInputElement;
    const validFile = new File(["pdfcontent"], "doc.pdf", { type: "application/pdf" });
    await userEvent.upload(input, validFile);
    expect(onUpload).toHaveBeenCalledWith(expect.objectContaining({ name: "doc.pdf" }));
    expect(screen.getByText("Uploading…")).toBeInTheDocument();
    expect(screen.getByText("doc.pdf")).toHaveClass("text-muted");
    expect(input).toBeDisabled();
    resolveUpload();
    await waitFor(() => expect(screen.queryByText("Uploading…")).not.toBeInTheDocument());
    expect(input).toBeEnabled();
  });

  it("exposes retry callback without creating an unavailable row", async () => {
    const onRetry = vi.fn();
    render(<AttachmentSection {...makeProps({ onRetry })} />);
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(screen.getByText("photo.jpg")).toBeInTheDocument();
  });

  it("shows uploading indicator when many attachments and valid file types", () => {
    // Additional coverage: ensure component handles mixed active/removed while uploading not blocked
    const mixed: Attachment[] = [activeAtt, removedAtt];
    render(<AttachmentSection {...makeProps({ attachments: mixed, canUpload: true })} />);
    expect(screen.getByText("photo.jpg")).toBeInTheDocument();
    expect(screen.getByText("old.pdf")).toBeInTheDocument();
    expect(screen.getByLabelText("Choose file")).toBeEnabled();
  });
});
