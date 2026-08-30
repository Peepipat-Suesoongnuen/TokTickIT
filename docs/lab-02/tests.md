# Lab 2 Test Plan and Results — TokTickIT Requester Ticketing

Companion to [specification.md](./specification.md) and [api-spec.md](./api-spec.md). Created before implementation (Test DD / TDD): every planned test below will be written as a failing test first, then implementation will make it pass. This document describes the planned TDD evidence for the next implementation issues; Lab 2 test files for My Tickets (Issue 9) have been added in this PR as feature-branch evidence (see §6), but rows remain `Planned` until the final `main` green run.

**Status key:** `Planned` while on the feature branch (failing-first TDD). A row becomes `Pass` **only after a green run on the final `main` branch** — never from a feature-branch run alone.

## 1. Test Strategy

| Level | Tool | Purpose |
|---|---|---|
| Unit | Vitest | Ticket Number generator (format, monthly reset, exhaustion), validation helpers (trim/bounds/enum) |
| API / integration | Supertest + Vitest | endpoint contracts: status codes, shapes, ownership, strict query contract |
| UI component | Vitest + Testing Library | rendering, states, field-level messages, busy submit |
| UI style assertions | Vitest | Zen Green tokens/classes, badges, asterisks, read-only styling |
| Responsive & visual | Playwright | screenshots at desktop/tablet/mobile + visual checklist (ui-spec.md §9) |
| E2E | Playwright | full requester flow across screens |

## 2. Planned Tests

### Unit — `server/src/lib/__tests__/`

| ID | Type | Requirement / AC | What It Tests | Expected Result | Test File | Final |
|---|---|---|---|---|---|---|
| UNIT-01 | Unit | AC-01, BR-01 | Ticket Number format `{YY}{MM}-0001` and monthly reset boundary | Correct format; sequence restarts at month change | server/src/lib/__tests__/ticket-number.test.ts | Planned |
| UNIT-02 | Unit | BR-01, Assumption 2 | Sequence increment; exhaustion signal at 9999 | Increments deterministically; exhaustion flagged for safe failure | server/src/lib/__tests__/ticket-number.test.ts | Planned |
| UNIT-03 | Unit | AC-02, AC-03 | Trim + length validation summary 5–120 / description 20–2,000 | Trimmed values validated per BR-10 | server/src/lib/__tests__/validation.test.ts | Planned |
| UNIT-04 | Unit | AC-04 | Reference-id validity + priority enum `LOW\|MEDIUM\|HIGH\|CRITICAL` | Rejects non-reference ids and invalid enum values | server/src/lib/__tests__/validation.test.ts | Planned |

### API — `server/tests/lab-02/`

| ID | Type | Requirement / AC | What It Tests | Expected Result | Test File | Final |
|---|---|---|---|---|---|---|
| API-01 | API | AC-07 | GET /api/requesters returns only active requesters | Inactive requester absent from response | server/tests/lab-02/reference-data.api.test.ts | Planned |
| API-02 | API | AC-09 | GET /api/requesters when none active | 200 with `[]` | server/tests/lab-02/reference-data.api.test.ts | Planned |
| API-03 | API | FR-01 | GET /api/categories & /api/related-systems active-only, ordered by name | Ordered arrays of active records | server/tests/lab-02/reference-data.api.test.ts | Planned |
| API-04 | API | AC-01 | POST valid ticket | 201; backend-generated number; status NEW; saved values returned from DB | server/tests/lab-02/create-ticket.api.test.ts | Planned |
| API-05 | API | AC-02, AC-03 | Summary/description out-of-bounds (min & max) | 400 + fieldErrors with documented copy | server/tests/lab-02/create-ticket.api.test.ts | Planned |
| API-06 | API | AC-04 | Invalid categoryId / relatedSystemId / requestedPriority | 400 for each case | server/tests/lab-02/create-ticket.api.test.ts | Planned |
| API-07 | API | BR-08 | Ticket bound to submitted requesterId | Persisted requesterId matches; immutable | server/tests/lab-02/create-ticket.api.test.ts | Planned |
| API-08 | API | AC-11 | Requester B lists tickets | None of Requester A's tickets appear | server/tests/lab-02/my-tickets.api.test.ts | Planned |
| API-09 | API | AC-12 | Search: case-insensitive partial on summary OR description; whitespace-only value | Correct match set; whitespace-only → 400 | server/tests/lab-02/my-tickets.api.test.ts | Planned |
| API-10 | API | AC-13 | Filter by categoryId and requestedPriority (no status filter in Lab 2) | Only matching tickets returned | server/tests/lab-02/my-tickets.api.test.ts | Planned |
| API-11 | API | AC-14, BR-21 | Default sort updatedAt DESC + id DESC; priority rank ASC = LOW→CRITICAL, DESC reverse | Ordering matches contract | server/tests/lab-02/my-tickets.api.test.ts | Planned |
| API-12 | API | AC-15 | Pagination metadata; page sizes {10,20,50}; page > totalPages → 200 empty data with valid meta | Correct meta fields per api-spec §5.2 | server/tests/lab-02/my-tickets.api.test.ts | Planned |
| API-13 | API | AC-16 | Strict query contract: unknown param name → 400; invalid known value → 400 | Exact statuses per api-spec §5.2 | server/tests/lab-02/my-tickets.api.test.ts | Planned |
| API-14 | API | AC-10 | Detail of A's ticket requested as B; nonexistent id | 404 safe envelope both cases | server/tests/lab-02/ticket-detail.api.test.ts | Planned |
| API-15 | API | FR-08 | Owned detail includes removed attachment metadata | 200; removed rows show removedAt/removedReason | server/tests/lab-02/ticket-detail.api.test.ts | Planned |
| API-16 | API | AC-18 | Valid upload (permitted type ≤ 5 MB) | 201 + metadata; active record created | server/tests/lab-02/attachments.api.test.ts | Planned |
| API-17 | API | AC-19 | Wrong type → 415; oversize > 5 MB → 413 | Exact statuses; no record created | server/tests/lab-02/attachments.api.test.ts | Planned |
| API-18 | API | AC-20 | Upload when 5 active attachments exist | 409 Conflict | server/tests/lab-02/attachments.api.test.ts | Planned |
| API-19 | API | AC-21, BR-09 | Remove owned attachment with reason; B removes A's attachment (ownership enforcement) | 200 retained metadata / 404 safe | server/tests/lab-02/attachments.api.test.ts | Planned |
| API-20 | API | BR-17 | Download after removal | Blocked with 404 | server/tests/lab-02/attachments.api.test.ts | Planned |
| API-21 | API | AC-22 | Remove without reason / blank reason | 400 + fieldError | server/tests/lab-02/attachments.api.test.ts | Planned |
| API-22 | API | AC-23, BR-18 | Initial upload partial failure | Ticket remains created; successful uploads saved; failure reported; retry possible | server/tests/lab-02/attachments.api.test.ts | Planned |
| API-23 | API | api-spec §7 | Forced unexpected server fault via mocked Prisma/service dependency (`vi.mock`), real route and error middleware active | 500 with safe generic envelope; no stack traces or internals in response | server/tests/lab-02/create-ticket.api.test.ts | Planned |
| API-24 | API | AC-24 | Requester B retrieves **metadata** of A's attachment | 404 safe envelope | server/tests/lab-02/attachments.api.test.ts | Planned |
| API-25 | API | AC-24 | Requester B **downloads** A's active attachment | 404 safe envelope | server/tests/lab-02/attachments.api.test.ts | Planned |
| API-26 | API | FR-10 | Owner retrieves **metadata** of owned active attachment | 200 correct shape (originalFilename, mimeType, sizeBytes, removedAt null) | server/tests/lab-02/attachments.api.test.ts | Planned |
| API-27 | API | FR-10 | Owner **downloads** owned active attachment | 200 binary stream; `Content-Type` = stored mime; `Content-Disposition: attachment; filename="<originalFilename>"` | server/tests/lab-02/attachments.api.test.ts | Planned |

Planned manual evidence (deferred, not present in this PR): backend-stop demo for AC-25/AC-26 safe states will be captured in the submission PDF after implementation.

### UI Component — `client/src/features/lab-02/tests/`

| ID | Type | Requirement / AC | What It Tests | Expected Result | Test File | Final |
|---|---|---|---|---|---|---|
| UI-01 | UI | AC-02 | Summary out-of-bounds shows field-level message; form not submitted | Message under field; no request | client/src/features/lab-02/tests/CreateTicket.test.tsx | Planned |
| UI-02 | UI | AC-03 | Description out-of-bounds message | Message under field | client/src/features/lab-02/tests/CreateTicket.test.tsx | Planned |
| UI-03 | UI | AC-05 | Submit while pending | Busy/disabled; exactly one request | client/src/features/lab-02/tests/CreateTicket.test.tsx | Planned |
| UI-04 | UI | AC-26 | Submission failure | Safe banner; entered values preserved | client/src/features/lab-02/tests/CreateTicket.test.tsx | Planned |
| UI-05 | UI | AC-01 | Success state | Official Ticket Number rendered | client/src/features/lab-02/tests/CreateTicket.test.tsx | Planned |
| UI-06 | UI | AC-22 | Removal modal confirm blocked until non-empty reason | Confirm disabled while blank | client/src/features/lab-02/tests/AttachmentSection.test.tsx | Planned |
| UI-07 | UI | AC-17 | Empty vs no-results rendering | Distinct copy + CTA per state | client/src/features/lab-02/tests/MyTickets.test.tsx | Planned |
| UI-08 | UI | AC-12, AC-13 | Search/filter controls issue correct query params | Params match api-spec §5.2 | client/src/features/lab-02/tests/MyTickets.test.tsx | Planned |
| UI-09 | UI | AC-25 | Screen load failure | Safe error state + Retry | client/src/features/lab-02/tests/MyTickets.test.tsx | Planned |
| UI-10 | UI | AC-10 | Detail 404 view | "Ticket not found" + back link | client/src/features/lab-02/tests/RequesterTicketDetail.test.tsx | Planned |
| UI-11 | UI | AC-21 | Removed attachment row | Struck-through/muted; no Download action | client/src/features/lab-02/tests/RequesterTicketDetail.test.tsx | Planned |
| UI-12 | UI | AC-23 | Failed initial upload reported | Failure entry + retry control present | client/src/features/lab-02/tests/AttachmentSection.test.tsx | Planned |
| UI-13 | UI | AC-19 | Invalid selected file behavior | Stays local with rejection reason; not uploaded; dismissible; not counted toward limit | client/src/features/lab-02/tests/AttachmentSection.test.tsx | Planned |
| UI-14 | UI | BR-14 | Limit helper text at 5 active attachments | "Maximum of 5 active attachments reached" shown | client/src/features/lab-02/tests/AttachmentSection.test.tsx | Planned |
| UI-15 | UI | AC-06 | No requester selected opens guarded screen | Requester Selection screen shown | client/src/features/lab-02/tests/RequesterSelection.test.tsx | Planned |
| UI-16 | UI | AC-08 | Change Requester | Refetch of requester-specific data | client/src/features/lab-02/tests/RequesterSelection.test.tsx | Planned |
| UI-17 | UI | AC-07, AC-09 | Dropdown excludes inactive; empty & failure states render | States render per ui-spec §5.1 | client/src/features/lab-02/tests/RequesterSelection.test.tsx | Planned |
| UI-18 | UI | AC-05, BR-12 | Busy label during submit | "Submitting…" + disabled | client/src/features/lab-02/tests/CreateTicket.test.tsx | Planned |
| UI-19 | UI | AC-28 | Keyboard navigation + visible focus + accessible labels on key screens & removal modal | All controls reachable/labeled; focus indicators present | client/src/features/lab-02/tests/ui-style.test.tsx | Planned |
| UI-20 | UI | AC-27 | Mobile-width layout classes (jsdom proxy check) | No horizontal overflow classes/styles applied | client/src/features/lab-02/tests/ui-style.test.tsx | Planned |
| UI-21 | UI | FR-02, FR-12 | Requester Selection loading spinner during fetch | Loading state renders before data arrives | client/src/features/lab-02/tests/RequesterSelection.test.tsx | Planned |
| UI-22 | UI | AC-25, FR-12 | Create Ticket reference-data loading and failure | Skeleton/spinner while loading; on failure Category/Related System stay disabled, Submit disabled, entered Summary/Description preserved (ui-spec §5.2) | client/src/features/lab-02/tests/CreateTicket.test.tsx | Planned |
| UI-23 | UI | FR-12 | My Tickets loading state | Spinner/skeleton renders before list data arrives | client/src/features/lab-02/tests/MyTickets.test.tsx | Planned |
| UI-24 | UI | AC-25 | Ticket Detail loading and API failure | Skeleton during load; safe banner + Retry on failure | client/src/features/lab-02/tests/RequesterTicketDetail.test.tsx | Planned |

### UI Style — `client/src/features/lab-02/tests/`

| ID | Type | Requirement / AC | What It Tests | Expected Result | Test File | Final |
|---|---|---|---|---|---|---|
| STYLE-01 | Style | ui-spec §1 | Header/primary actions use #006B3C token class | Token class present | client/src/features/lab-02/tests/ui-style.test.tsx | Planned |
| STYLE-02 | Style | ui-spec §1 | Selected row/card pale green #EAF6EF | Token class present | client/src/features/lab-02/tests/ui-style.test.tsx | Planned |
| STYLE-03 | Style | ui-spec §5.3 | Priority/status badge classes per value (LOW gray … CRITICAL red; NEW pale green) | Badge class mapping correct | client/src/features/lab-02/tests/ui-style.test.tsx | Planned |
| STYLE-04 | Style | ui-spec §3 | Required-field asterisks on required labels | Asterisk element present | client/src/features/lab-02/tests/ui-style.test.tsx | Planned |
| STYLE-05 | Style | ui-spec §3 | Read-only vs editable field class distinction | Distinct classes applied | client/src/features/lab-02/tests/ui-style.test.tsx | Planned |

Style tests provide requirement-level evidence for the Zen Green contract (ui-spec.md); they are not responsive-behavior evidence.

### E2E — `e2e/lab-02/`

| ID | Type | Requirement / AC | What It Tests | Expected Result | Test File | Final |
|---|---|---|---|---|---|---|
| E2E-01 | E2E | AC-01, AC-12 | Select requester → create ticket → **search in My Tickets** (case-insensitive partial match) → open found ticket detail | Official number consistent end-to-end; search returns the created ticket | e2e/lab-02/requester-ticket-flow.spec.ts | Planned |
| E2E-02 | E2E | AC-10 | B opens A's ticket via direct URL | Not-found view | e2e/lab-02/requester-ticket-flow.spec.ts | Planned |
| E2E-03 | E2E | AC-21, AC-22 | Removal modal: first attempts Confirm with blank reason (**blocked**, AC-22), then enters valid reason and confirms removal succeeds (AC-21) | Confirm disabled while reason blank; after valid reason row becomes removed state and download action gone | e2e/lab-02/requester-ticket-flow.spec.ts | Planned |
| E2E-04 | E2E | AC-08, AC-11 | Switch requester A↔B | Lists swap accordingly; A's tickets never appear for B | e2e/lab-02/requester-ticket-flow.spec.ts | Planned |
| E2E-05 | E2E | AC-27 | Screenshots at 1440/900/375 into artifacts/lab-02/screenshots/ | Files written; visual checklist executable | e2e/lab-02/requester-ticket-flow.spec.ts | Planned |

## 3. Acceptance-Criterion Traceability Matrix (AC → Test IDs)

| AC | Test IDs |
|---|---|
| AC-01 | UNIT-01, API-04, UI-05, E2E-01 |
| AC-02 | UNIT-03, API-05, UI-01 |
| AC-03 | UNIT-03, API-05, UI-02 |
| AC-04 | UNIT-04, API-06 |
| AC-05 | UI-03, UI-18 |
| AC-06 | UI-15 |
| AC-07 | API-01, UI-17 |
| AC-08 | UI-16, E2E-04 |
| AC-09 | API-02, UI-17 |
| AC-10 | API-14, UI-10, E2E-02 |
| AC-11 | API-08, E2E-04 |
| AC-12 | API-09, UI-08, E2E-01 |
| AC-13 | API-10, UI-08 |
| AC-14 | API-11 |
| AC-15 | API-12 |
| AC-16 | API-13 |
| AC-17 | UI-07 |
| AC-18 | API-16 |
| AC-19 | API-17, UI-13 |
| AC-20 | API-18 |
| AC-21 | API-19, API-20, UI-11, E2E-03 |
| AC-22 | API-21, UI-06, E2E-03 |
| AC-23 | API-22, UI-12 |
| AC-24 | API-24, API-25 |
| AC-25 | UI-17, UI-22, UI-09, UI-24 |
| AC-26 | UI-04 |
| AC-27 | UI-20, E2E-05, visual checklist §4 |
| AC-28 | UI-19 |

Coverage rule satisfied: every AC maps to ≥ 1 planned automated test whose scenario actually exercises it (no broad ranges). AC-25 will additionally be evidenced by a planned manual backend-stop demo (deferred) for the PDF.

FR/BR coverage is recorded in the `Requirement / AC` column of the Planned Tests table where automated verification is applicable. Design-only constraints are verified through contract/schema review and are not forced into unrelated Acceptance Criteria. BR-24 is a design constraint verified by schema/design review during Issue 6 (no runtime test).

## 4. Responsive and Visual Checklist

To be executed against [ui-spec.md](./ui-spec.md) §9 at 1440 / 900 / 375 px widths; results will be recorded with screenshots under `artifacts/lab-02/screenshots/` (paths defined there). Checklist items: color tokens, editable/read-only distinction, asterisk + message placement, button hierarchy, badge consistency, no clipping/overlap/horizontal scroll, filter/pagination/attachment usability at all sizes, empty vs no-results distinction. This section describes planned visual evidence; screenshots will be produced during the implementation issues and are not present in this documentation-only PR.

## 5. Test Commands

```bash
# Server unit + API tests
cd server && npm test

# Client unit + UI + style tests
cd client && npm test

# E2E + responsive screenshots
npx playwright test
```

Database prerequisites (implemented):
- PostgreSQL running locally.
- API/integration tests use a dedicated test database when `TEST_DATABASE_URL` is set (see `server/.env.example`); when unset they fall back to `DATABASE_URL` with **targeted cleanup** (`ticketNumber in [...]`) so no dev data is wiped — satisfying isolation without breaking fresh clones.
- Before the API/integration test suite runs on the test DB, apply migrations: `TEST_DATABASE_URL="..." npx prisma migrate deploy` (or `DATABASE_URL` fallback).
- Seed/fixtures: idempotent Prisma seed (`cd server && npx prisma db seed` or `TEST_DATABASE_URL=... npx prisma db seed`).
- `.env` configured from `.env.example` (copy to `.env`).
- Isolation: tests use targeted cleanup by `ticketNumber` prefix per suite plus deterministic fixtures; no `deleteMany({})` on the whole DB. When `TEST_DATABASE_URL` is used the entire test DB is isolated by URL.
- Hosted CI (`.github/workflows/ci.yml`) provisions Postgres service and runs `TEST_DATABASE_URL`-backed tests on every push/PR.

## 6. Final Results

Every row's `Final` column stays **Planned** during feature-branch development (failing-first TDD). Rows move to **Pass** only when the corresponding test runs green on the final `main` branch; terminal output is captured then for the submission PDF (Answer Part 3). No test may be marked Pass from a feature-branch or staging-only run.

**Feature-branch evidence (Issue 9, `feature/9-my-tickets` @ f6f5587 → next):** `cd server && npm test` — 25 passed; `cd client && npm test` — 15 passed; `tsc --noEmit` clean; `git diff --check` clean (fixed 167/216 + final newline); `TEST_DATABASE_URL` isolated (`server/.env.example` + `prisma.ts`); Hosted CI `.github/workflows/ci.yml` will run `TEST_DATABASE_URL`-backed tests on push. Evidence below remains `Planned` per the rule above until the final `main` green run (see PR #24).

## 7. Known Limitations or Deferred Tests

- Asia/Bangkok display formatting will be verified manually and evidenced by planned screenshots (deferred; not present in this PR; unit-testing timezone rendering adds flakiness).
- Accessibility (AC-28) covered by semi-automated assertions (UI-19); full audit manual.
- Backend idempotency keys out of scope in Lab 2 (AC-05 enforced at UI layer per api-spec §7).
- API-23 will use `vi.mock` fault injection of the Prisma/service dependency while keeping real routing and error middleware active; the planned manual backend-stop demo will provide additional real-infrastructure evidence for AC-25/AC-26 (deferred).
