import { trimValue } from "./validation.js";

// Lab 4 (Issue #77) — ActionTaken field validation (specification BR-005–BR-007).
// Pure helpers shared by routes and unit tests; server revalidates everything.
export const ACTION_DESCRIPTION_MIN = 1;
export const ACTION_DESCRIPTION_MAX = 1000;
export const ACTION_RESULT_MAX = 2000;
export const ACTION_FOLLOW_UP_NOTE_MIN = 1;
export const ACTION_FOLLOW_UP_NOTE_MAX = 500;
export const ACTION_ATTACHMENT_NOTES_MAX = 500;
// Honest work-date tolerance above server now (BR-007).
export const ACTION_DATE_TOLERANCE_HOURS = 1;

function isTrimmedLengthValid(content: unknown, min: number, max: number): boolean {
  if (typeof content !== "string") return false;
  const t = trimValue(content);
  return t.length >= min && t.length <= max;
}

export function isDescriptionValid(description: unknown): boolean {
  return isTrimmedLengthValid(description, ACTION_DESCRIPTION_MIN, ACTION_DESCRIPTION_MAX);
}

export function isResultValid(result: unknown): boolean {
  if (result == null) return true;
  if (typeof result !== "string") return false;
  return trimValue(result).length <= ACTION_RESULT_MAX;
}

export function isFollowUpNoteValid(followUpRequired: unknown, note: unknown): boolean {
  if (followUpRequired === true) {
    return isTrimmedLengthValid(note, ACTION_FOLLOW_UP_NOTE_MIN, ACTION_FOLLOW_UP_NOTE_MAX);
  }
  if (note == null) return true;
  if (typeof note !== "string") return false;
  return trimValue(note).length <= ACTION_FOLLOW_UP_NOTE_MAX;
}

export function isAttachmentNotesValid(notes: unknown): boolean {
  if (notes == null) return true;
  if (typeof notes !== "string") return false;
  return trimValue(notes).length <= ACTION_ATTACHMENT_NOTES_MAX;
}

export function isActionDateInRange(actionDate: unknown, ticketDate: Date, now: Date): boolean {
  if (!(actionDate instanceof Date) || Number.isNaN(actionDate.getTime())) return false;
  if (!(ticketDate instanceof Date) || !(now instanceof Date)) return false;
  const upper = now.getTime() + ACTION_DATE_TOLERANCE_HOURS * 36e5;
  return actionDate.getTime() >= ticketDate.getTime() && actionDate.getTime() <= upper;
}

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export function isUuid(value: unknown): boolean {
  return typeof value === "string" && UUID_RE.test(value);
}

export interface CreateIntent {
  description: unknown;
  assignedToId: unknown;
  actionDate: unknown;
  followUpRequired: unknown;
  followUpNote: unknown;
  attachmentNotes: unknown;
  result: unknown;
}

// Canonical normalized create intent for idempotency comparison (BR-025):
// texts trimmed (description byte-exact after trim, case-sensitive),
// datetimes compared as UTC instants so equivalent offsets match.
export function normalizeCreateIntent(intent: CreateIntent): string {
  const text = (v: unknown): string | null => {
    if (v == null) return null;
    if (typeof v !== "string") return `!type:${typeof v}`;
    return trimValue(v);
  };
  let instant: string;
  if (intent.actionDate instanceof Date && !Number.isNaN(intent.actionDate.getTime())) {
    instant = intent.actionDate.toISOString();
  } else if (typeof intent.actionDate === "string") {
    const d = new Date(intent.actionDate);
    instant = Number.isNaN(d.getTime()) ? `!invalid:${intent.actionDate}` : d.toISOString();
  } else {
    instant = "!missing";
  }
  return JSON.stringify({
    description: text(intent.description),
    assignedToId: typeof intent.assignedToId === "number" ? intent.assignedToId : null,
    actionDate: instant,
    followUpRequired: intent.followUpRequired === true,
    followUpNote: intent.followUpRequired === true ? text(intent.followUpNote) : null,
    attachmentNotes: text(intent.attachmentNotes),
    result: text(intent.result),
  });
}
