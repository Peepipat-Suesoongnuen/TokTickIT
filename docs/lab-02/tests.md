# Lab 2 Test Plan and Results — TokTickIT Requester Ticketing

Companion to [specification.md](./specification.md) and [api-spec.md](./api-spec.md). Created before implementation as the Test DD / TDD plan. Feature behavior changes are developed failing-first where a behavior is not yet implemented. Final-integration work may also close a previously planned **evidence gap** for behavior that already exists; such a test can legitimately pass on its first execution and must be recorded as evidence closure rather than retroactively claimed as a Red→Green implementation cycle. This document keeps the original planned-test contract and records feature-branch evidence as implementation progresses (see §6). Rows remain `Planned` until the final `main` green run, even when the corresponding automated test already exists and is green on a feature branch or `lab2-staging`.

**Status key:** `Planned` before final-main verification, regardless of whether feature-branch evidence came from a failing-first change or an evidence-gap closure. A row becomes `Pass` **only after a green run on the final `main` branch** — never from a feature-branch or staging-only run alone.

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
| UNIT-04 | Unit | AC-04 | Requested Priority enum `LOW\|MEDIUM\|HIGH\|CRITICAL`; pure reference-id shape only if a production helper exists | Invalid priority rejected; DB reference existence/active validity remains API-06 evidence | server/src/lib/__tests__/validation.test.ts | Planned |

### API — `server/tests/lab-02/`

| ID | Type | Requirement / AC | What It Tests | Expected Result | Test File | Final |
|---|---|---|---|---|---|---|
| API-01 | API | AC-07 | GET /api/requesters returns only active requesters | Inactive requester absent from response | server/tests/lab-02/reference-data.api.test.ts | Planned |
| API-02 | API | AC-09 | GET /api/requesters when none active | 200 with `[]` | server/tests/lab-02/reference-data.api.test.ts | Planned |
| API-03 | API | FR-01 | GET /api/categories & /api/related-systems active-only, ordered by name | Ordered arrays of active records | server/tests/lab-02/reference-data.api.test.ts | Planned |
| API-04 | API | AC-01 | POST valid ticket | 201; backend-generated number; status NEW; saved values returned from DB | server/tests/lab-02/create-ticket.api.test.ts | Planned |
| API-05 | API | AC-02, AC-03 | Summary/description out-of-bounds (min & max) | 400 + fieldErrors with documented copy | server/tests/lab-02/create-ticket.api.test.ts | Planned |
| API-06 | API | AC-04 | Invalid categoryId / relatedSystemId / requestedPriority | 400 for each case | server/tests/lab-02/create-ticket.api.test.ts | Planned |
| API-07 | API | BR-08 | Ticket bound to submitted requesterId | Persisted requesterId matches the submitted requester at creation | server/tests/lab-02/create-ticket.api.test.ts | Planned |
| API-08 | API | AC-11 | Requester B lists tickets | None of Requester A's tickets appear | server/tests/lab-02/my-tickets.api.test.ts | Planned |
| API-09 | API | AC-12 | Search: case-insensitive partial on Ticket Number OR Summary; Description-only term; whitespace-only value | Ticket Number/Summary matches returned; Description-only term excluded; whitespace-only → 400 | server/tests/lab-02/my-tickets.api.test.ts | Planned |
| API-10 | API | AC-13 | Filter by active categoryId, requestedPriority, and currentStatus=`NEW`; reject inactive categoryId / invalid status | Only matching tickets returned; inactive category or invalid status → 400 | server/tests/lab-02/my-tickets.api.test.ts | Planned |
| API-11 | API | AC-14, BR-21 | Default updatedAt DESC + id DESC; priority rank; Ticket Number ASC/DESC; Ticket Date/Created ASC/DESC | Ordering matches contract | server/tests/lab-02/my-tickets.api.test.ts | Planned |
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
| API-22 | API / integration | AC-23, BR-18 | Create Ticket succeeds, one attachment upload succeeds, later upload is rejected | Ticket remains retrievable; successful upload remains active; rejected file creates no attachment | server/tests/lab-02/initial-attachment-failure.api.test.ts | Planned |
| API-23 | API | api-spec §7 | Forced unexpected server fault via mocked Prisma/service dependency (`vi.mock`), real route and error middleware active | 500 with safe generic envelope; no stack traces or internals in response | server/tests/lab-02/create-ticket.api.test.ts | Planned |
| API-24 | API | AC-24 | Requester B retrieves **metadata** of A's attachment | 404 safe envelope | server/tests/lab-02/attachments.api.test.ts | Planned |
| API-25 | API | AC-24 | Requester B **downloads** A's active attachment | 404 safe envelope | server/tests/lab-02/attachments.api.test.ts | Planned |
| API-26 | API | FR-10 | Owner retrieves **metadata** of owned active attachment | 200 correct shape (originalFilename, mimeType, sizeBytes, removedAt null) | server/tests/lab-02/attachments.api.test.ts | Planned |
| API-27 | API | FR-10 | Owner **downloads** owned active attachment | 200 binary stream; `Content-Type` = stored mime; `Content-Disposition: attachment; filename="<originalFilename>"` | server/tests/lab-02/attachments.api.test.ts | Planned |

Planned submission evidence for AC-25/AC-26 will show the safe failure state with entered values preserved. The Labsheet permits either stopping the backend **or simulating failure**; deterministic failure simulation already exists through component/API tests and `VISUAL-01`, while a live backend-stop demonstration may be added as optional extra evidence if useful for the final PDF/demo.

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
| UI-12 | UI | AC-23 | Initial attachment upload failure after Ticket creation | Success state remains with official Ticket Number; failed filename/reason shown; Retry from Ticket Detail link points to created Ticket | client/src/features/lab-02/tests/CreateTicketAttachments.test.tsx | Planned |
| UI-13 | UI | AC-19 | Invalid file selected on Create Ticket | Local rejection reason + Dismiss shown; invalid file is excluded from attachment upload | client/src/features/lab-02/tests/CreateTicketAttachments.test.tsx | Planned |
| UI-14 | UI | BR-14 | Limit helper text at 5 active attachments | "Maximum of 5 active attachments reached" shown | client/src/features/lab-02/tests/AttachmentSection.test.tsx | Planned |
| UI-15 | UI | AC-06 | No requester selected opens guarded screen | Requester Selection screen shown | client/src/features/lab-02/tests/RequesterSelection.test.tsx | Planned |
| UI-16 | UI | AC-08 | Change Requester | Refetch of requester-specific data | client/src/features/lab-02/tests/RequesterSelection.test.tsx | Planned |
| UI-17 | UI | AC-07, AC-09 | Dropdown renders the backend's active-only requester response; empty & failure/Retry states render | API response renders as supplied; empty/failure states follow ui-spec §5.1. API-01, not the client, proves inactive exclusion | client/src/features/lab-02/tests/RequesterSelection.test.tsx | Planned |
| UI-18 | UI | AC-05, BR-12 | Busy label during submit | "Submitting…" + disabled | client/src/features/lab-02/tests/CreateTicket.test.tsx | Planned |
| UI-19 | UI | AC-28 | Component-level accessibility semantics/focus behavior: nav toggle aria state, first-invalid-field focus, removal modal label/Esc/focus return | Component semantics and focus behavior correct; full keyboard reachability/visible-focus evidence is `A11Y-01` | client/src/features/lab-02/tests/ui-style.test.tsx | Planned |
| UI-20 | UI | AC-27 | Responsive proxy classes on mobile nav and Create actions | Mobile nav/stack classes applied; real-browser no-overflow evidence is `E2E-05` + `VISUAL-01` | client/src/features/lab-02/tests/ui-style.test.tsx | Planned |
| UI-21 | UI | FR-02, FR-12 | Requester Selection loading spinner during fetch | Loading state renders before data arrives | client/src/features/lab-02/tests/RequesterSelection.test.tsx | Planned |
| UI-22 | UI | AC-25, FR-12 | Create Ticket reference-data loading and failure | Skeleton/spinner while loading; on failure Category/Related System stay disabled, Submit disabled, entered Summary/Description preserved (ui-spec §5.2) | client/src/features/lab-02/tests/CreateTicket.test.tsx | Planned |
| UI-23 | UI | FR-12, AC-08, AC-25 | My Tickets loading, requester-switch race protection, and category metadata failure/Retry | Latest requester wins; stale success/failure ignored; category failure does not hide loaded tickets | client/src/features/lab-02/tests/MyTickets.test.tsx | Planned |
| UI-24 | UI | AC-25 | Ticket Detail loading and API failure | Skeleton during load; safe banner + Retry on failure | client/src/features/lab-02/tests/RequesterTicketDetail.test.tsx | Planned |
| UI-25 | UI | FR-07, AC-14, AC-28 | My Tickets heading Clear Filters, accessible sortable headers/mobile sort controls, Ticket Number link, and row/card navigation | Reset/default behavior correct; sort state/query correct; no Action column; detail navigation remains accessible | client/src/features/lab-02/tests/MyTickets.test.tsx | Planned |
| UI-26 | UI | ui-spec §5.2, §5.4; AC-28 | Create Ticket + Ticket Detail top-right `Back to My Tickets` navigation | Real `/my-tickets` links render in the heading area; Create Back does not submit; Detail Back does not mutate Ticket/Attachments; controls remain keyboard-accessible | client/src/features/lab-02/tests/CreateTicket.test.tsx; client/src/features/lab-02/tests/RequesterTicketDetail.test.tsx | Planned |
| UI-27 | UI | ui-spec §5.3, AC-27 | My Tickets visible toolbar labels including Current Status, stable seven-column table plan, uniform muted-green header styling, neutral zebra rows, two-line Summary clamp, Created/Ticket Date display and sorting | Labels match accessible names; Current Status filter forwards `NEW`; Created sits after Ticket Number and sorts via `ticketDate`; fixed column plan does not depend on content length; full Summary remains in DOM while visual rows stay consistent with ellipsis; table header stays visually subordinate to the primary app header while remaining readable and keyboard focus remains visible | client/src/features/lab-02/tests/MyTickets.test.tsx; e2e/lab-02/accessibility.spec.ts | Planned |

### UI Style — `client/src/features/lab-02/tests/`

| ID | Type | Requirement / AC | What It Tests | Expected Result | Test File | Final |
|---|---|---|---|---|---|---|
| STYLE-01 | Style | ui-spec §1 | Header/primary actions use #006B3C token class | Token class present | client/src/features/lab-02/tests/ui-style.test.tsx | Planned |
| STYLE-02 | Style | ui-spec §1, §4 | Selected Requester identity uses pale-green emphasis class #EAF6EF | Token class present on selected identity | client/src/features/lab-02/tests/ui-style.test.tsx | Planned |
| STYLE-03 | Style | ui-spec §5.3 | Priority/status badge classes per value (LOW gray … CRITICAL red; NEW pale green) | Badge class mapping correct | client/src/features/lab-02/tests/ui-style.test.tsx | Planned |
| STYLE-04 | Style | ui-spec §3 | Required-field asterisks on required labels | Asterisk element present | client/src/features/lab-02/tests/ui-style.test.tsx | Planned |
| STYLE-05 | Style | ui-spec §3 | Read-only vs editable field class distinction | Distinct classes applied | client/src/features/lab-02/tests/ui-style.test.tsx | Planned |

Style tests provide requirement-level evidence for the Zen Green contract (ui-spec.md); they are not responsive-behavior evidence.

**Issue 13 client API-boundary hardening:** `client/src/features/lab-02/tests/api.test.tsx` verifies that `listTickets()` accepts valid ISO 8601 UTC `ticketDate` values and rejects missing, non-parseable, or parseable-but-non-ISO-UTC values before normal My Tickets rendering. This strengthens the existing api-spec §5.2 contract rather than introducing a new user-facing Acceptance Criterion.

### E2E — `e2e/lab-02/`

| ID | Type | Requirement / AC | What It Tests | Expected Result | Test File | Final |
|---|---|---|---|---|---|---|
| E2E-01 | E2E | AC-01, AC-12 | Select requester → create ticket → **search My Tickets by generated Ticket Number** → open found ticket detail | Official number consistent end-to-end; Ticket Number search returns the created ticket | e2e/lab-02/requester-ticket-flow.spec.ts | Planned |
| E2E-02 | E2E | AC-10 | B opens A's ticket via direct URL | Not-found view | e2e/lab-02/requester-ticket-flow.spec.ts | Planned |
| E2E-03 | E2E | AC-21, AC-22 | Removal modal: first attempts Confirm with blank reason (**blocked**, AC-22), then enters valid reason and confirms removal succeeds (AC-21) | Confirm disabled while reason blank; after valid reason row becomes removed state and download action gone | e2e/lab-02/requester-ticket-flow.spec.ts | Planned |
| E2E-04 | E2E | AC-08, AC-11 | Switch requester A↔B | Lists swap accordingly; A's tickets never appear for B | e2e/lab-02/requester-ticket-flow.spec.ts | Planned |
| E2E-05 | E2E | AC-27 | Screenshots at 1440/900/375 into artifacts/lab-02/screenshots/; page-level no-overflow at all widths; My Tickets table-wrapper no-overflow at desktop/tablet widths | Files written; no unintended page or visible desktop/tablet table-wrapper horizontal overflow | e2e/lab-02/requester-ticket-flow.spec.ts | Planned |
| A11Y-01 | E2E / accessibility | AC-28; ui-spec §7 | Keyboard-only Requester Selection, My Tickets, Create Ticket, Ticket Detail, and removal-modal flow | Visible enabled controls are Tab-reachable with visible focus; key controls have accessible labels and are operable; modal traps focus, closes on Esc, returns focus | e2e/lab-02/accessibility.spec.ts | Planned |
| VISUAL-01 | Responsive / visual | ui-spec §5, §7, §9; AC-17, AC-19, AC-25, AC-26, AC-27, AC-28 | Capture Requester Selection loading/failure, Create loading/validation/invalid-attachment/submitting/success/failure, My Tickets empty/no-results, and removed-attachment states; verify mobile nav touch target and visible focus outline | State screenshots written under artifacts/lab-02/screenshots/states/ with no horizontal page scroll; invalid-attachment evidence shows one valid and one rejected file together; nav target ≥44×44 and 2 px Zen-green focus outline | e2e/lab-02/visual-states.spec.ts | Planned |

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
| AC-14 | API-11, UI-25 |
| AC-15 | API-12 |
| AC-16 | API-13 |
| AC-17 | UI-07, VISUAL-01 |
| AC-18 | API-16 |
| AC-19 | API-17, UI-13, VISUAL-01 |
| AC-20 | API-18 |
| AC-21 | API-19, API-20, UI-11, E2E-03 |
| AC-22 | API-21, UI-06, E2E-03 |
| AC-23 | API-22, UI-12 |
| AC-24 | API-24, API-25 |
| AC-25 | UI-17, UI-22, UI-09, UI-24, VISUAL-01 |
| AC-26 | UI-04, VISUAL-01 |
| AC-27 | UI-20, UI-27, E2E-05, VISUAL-01, visual checklist §4 |
| AC-28 | UI-19, UI-25, UI-26, A11Y-01, VISUAL-01 |

Coverage rule satisfied: every AC maps to ≥ 1 planned automated test whose scenario actually exercises it (no broad ranges). AC-25/AC-26 final submission evidence may use the Labsheet-permitted controlled failure simulation; a backend-stop demo is optional extra evidence rather than a mandatory separate requirement.

FR/BR coverage is recorded in the `Requirement / AC` column of the Planned Tests table where automated verification is applicable. Design-only constraints are verified through contract/schema review and are not forced into unrelated Acceptance Criteria. BR-24 is a design constraint verified by schema/design review during Issue 6 (no runtime test).

## 4. Responsive and Visual Checklist

Issue 12 executed the checklist against [ui-spec.md](./ui-spec.md) §9. `E2E-05` regenerates the desktop/tablet/mobile screen evidence at 1440 / 900 / 375 px and asserts no horizontal page scrolling; Issue 13 additionally asserts that the visible My Tickets `.table-responsive` wrapper itself has no horizontal overflow at desktop/tablet widths. `VISUAL-01` deterministically captures the required UI states at mobile width and performs the same page-level horizontal-scroll assertion. The screenshots are stored under `artifacts/lab-02/screenshots/`.

| Checklist item | Executed feature/staging evidence |
|---|---|
| Zen Green colors | Central token/classes in `client/src/styles/lab2-theme.css`; `STYLE-01`/`STYLE-02` assertions; rendered screenshots inspected against ui-spec §1 |
| Editable vs read-only fields | `.form-readonly` applied to Create Ticket/Ticket Detail system fields; `STYLE-05`; screenshots show the gray-green read-only fill distinct from white editable controls |
| Required asterisks + validation placement | `.required-marker` + `aria-required`; `STYLE-04`; `VISUAL-01` `validation.png`; first invalid Category control receives focus |
| Button hierarchy + busy/disabled state | Zen primary class for primary actions, Bootstrap outline/destructive variants for secondary/destructive actions; `UI-03`/`UI-18`; `VISUAL-01` `submitting.png` |
| Priority/status badge consistency | Shared class mapping for LOW/MEDIUM/HIGH/CRITICAL and NEW across list/detail; `STYLE-03`; responsive screenshots inspected |
| No clipping / overlap / horizontal page scroll | `E2E-05` checks all three target widths and My Tickets table-wrapper overflow at desktop/tablet widths; `VISUAL-01` checks each state capture; screenshots visually inspected with no blocking clipping/overlap found |
| Filters, pagination, attachment controls usable responsively | My Tickets uses desktop table/mobile cards; `VISUAL-01` verifies the mobile navigation target is at least 44×44; attachment input/actions remain visible in responsive/detail evidence; `A11Y-01` verifies visible enabled controls remain keyboard reachable |
| Empty vs no-results states distinct | `UI-07`; `VISUAL-01` `empty.png` and `no-results.png` use distinct copy and CTA behavior |
| Requester loading/failure + Create validation/invalid-attachment/submitting/success/failure + list/removed evidence | `VISUAL-01` writes the required deterministic state images under `artifacts/lab-02/screenshots/states/`, including one valid + one invalid attachment selected together |

These are feature/staging verification records, not final-main `Pass` claims. The supplied Lab 2 Labsheet includes illustrative UI references: Figure 1 for Ticket Detail, a Development Requester Selection example, and a My Tickets example. Visual inspection compares the implemented screens against those supplied illustrations, the written Labsheet layout/style rules, the version-controlled `ui-spec.md`, and the rendered application screenshots. Because the Labsheet explicitly describes the screens as illustrative and permits modest aesthetic improvements/student-chosen exact arrangements, this is a design-language/layout comparison rather than a pixel-for-pixel clone requirement.

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
- API/integration tests use a dedicated database through `TEST_DATABASE_URL` (see `server/.env.example`). Do not point this variable at the development database.
- Prisma CLI reads `DATABASE_URL` from `schema.prisma`; it does not switch to `TEST_DATABASE_URL` automatically. Prepare the dedicated database with `DATABASE_URL="$TEST_DATABASE_URL" npx prisma migrate deploy` followed by `DATABASE_URL="$TEST_DATABASE_URL" npx prisma db seed`.
- The Prisma seed is idempotent and must run after migrations and before the API/integration test suite.
- `.env` configured from `.env.example` (copy to `.env`).
 - Isolation: tests use targeted cleanup by `ticketNumber` prefix per suite plus deterministic fixtures; no `deleteMany({})` on the whole DB. The `DATABASE_URL` used for migration/seed and the `TEST_DATABASE_URL` used by Vitest must identify the same dedicated test database.
 - Hosted CI (`.github/workflows/ci.yml`) provisions PostgreSQL, migrates and seeds `toktickit_test`, then runs the `TEST_DATABASE_URL`-backed tests on every push/PR.

### 5.1 Pre-push checklist — one-round fix (prevent repeat blockers)
Before pushing any Lab 2 feature branch, tick all:
- [ ] `TEST_DATABASE_URL` isolated via `server/src/prisma.ts` lazy `getPrisma()`; no `new PrismaClient()` in tests
- [ ] Exact `ticketNumber in [...]` cleanup (no `deleteMany({})`, no `startsWith("2608`) — see `helpers.ts`
- [ ] `path.resolve("uploads")` resolves from the server process working directory; documented local/CI commands run the relevant server/tests with `server/` as that working directory (do not use a literal `server/uploads` path inside server code/tests)
- [ ] `FOR UPDATE` lock + `Promise.all` concurrent `4→2 → 201+409 → active=5` regression test for max 5
- [ ] `isAllowedMime` paired + `isAllowedSignature` magic bytes (JPEG/PNG/WEBP/PDF) with `415` tests
- [ ] `Content-Disposition` `filename*` UTF-8 + sanitize, client parses `filename*`
- [ ] Modal `Removing…` busy, keep reason on fail, `aria-modal` + `Esc`/trap/return focus; `TicketDetail` `requestSeq` + `attachmentError` scope
- [ ] `ci.yml` guardrails pass + `git diff --check` clean + `tsc --noEmit` clean

## 6. Final Results

Every row's `Final` column stays **Planned** during feature-branch development and final-integration evidence closure. Rows move to **Pass** only when the corresponding test runs green on the final `main` branch; terminal output is captured then for the submission PDF (Answer Part 3). No test may be marked Pass from a feature-branch or staging-only run.

**Feature-branch evidence (Issue 9, `feature/9-my-tickets` @ 73bc6bb05bcc393d2dd465aaedbc8669ae85b212):** `cd server && npm test` — 33 passed (31 My Tickets + 2 Lab 1); `cd client && npm test` — 20 passed (17 My Tickets + 3 App); `npm run build` / `tsc --noEmit` clean both sides; `git diff --check` clean; `TEST_DATABASE_URL` isolated (`server/.env.example` + `prisma.ts`); Hosted CI `.github/workflows/ci.yml` **passed** — server 33 / client 20 — https://github.com/Peepipat-Suesoongnuen/TokTickIT/actions/runs/33320049779 and https://github.com/Peepipat-Suesoongnuen/TokTickIT/actions/runs/33320047712 (server 45s / client 17-21s, 4/4 success). Evidence below remains `Planned` per the rule above until the final `main` green run (see PR #24).

**Feature-branch evidence (Issue 10, `feature/10-ticket-detail-attachments` @ aee23b8):** `cd server && npm test` — 72 passed (31 My Tickets + 14 Detail + 22 Attachments + 3 Lib/Lab1 + 2 Lab1); `cd client && npm test` — 32 passed (17 MyTickets + 5 Detail + 7 AttachmentSection + 3 App); `tsc --noEmit` clean both sides; `git diff --check` clean; `TEST_DATABASE_URL` isolated + `server/uploads` git-ignored + pre-push checklist §5.1 + guardrails. Evidence below remains `Planned` until final `main` green run (see PR #25).

**Feature-branch evidence (Issue 11, `feature/11-e2e-responsive` @ `56fc162`):** `npm run test:e2e` — 5 passed (`E2E-01`…`E2E-05`) against dedicated `toktickit_test`; Playwright starts isolated API/UI servers on ports 3100/5174; responsive screenshots written for Create Ticket, My Tickets, and Ticket Detail at 1440/900/375 plus Requester Selection desktop; automated viewport checks assert no horizontal page scrolling. Hosted CI is verified on both the push run (`33486785881`) and pull-request run (`33486790500`) for `56fc162`: server, client, and E2E jobs all passed. The first hosted Issue 11 run exposed a 375 px Ticket Detail overflow, which was corrected by constraining the attachment file input with Bootstrap `form-control`; E2E-01 response synchronization was also made host-agnostic before the green runs. `Final` remains `Planned` until the required final `main` green run.

**Feature-branch evidence (Issue 12, `feature/12-ui-style-docs`, local verification before PR handoff):** `client/src/features/lab-02/tests/ui-style.test.tsx` covers `STYLE-01`…`STYLE-05`, `UI-19`, and `UI-20`; failing-first checks exposed missing mobile navigation, first-invalid-field focus, removal-modal focus return, and a Bootstrap-specificity defect that suppressed the required visible keyboard outline. `e2e/lab-02/accessibility.spec.ts` (`A11Y-01`) exercises keyboard reachability/operability, programmatic labels, visible focus, and modal focus trapping in a real browser across the AC-28 screens. `e2e/lab-02/visual-states.spec.ts` (`VISUAL-01`) captures loading, validation, submitting, success, failure, empty, no-results, and removed-attachment screenshots under `artifacts/lab-02/screenshots/states/` and verifies the mobile nav touch target/focus outline. Latest local regression: client Vitest **48/48 passed**, server Vitest/Supertest **82/82 passed**, full Playwright **7/7 passed** (`E2E-01`…`E2E-05`, `A11Y-01`, `VISUAL-01`), client/server `tsc --noEmit` passed, both builds passed, and `git diff --check` completed without whitespace errors. Hosted CI is intentionally not claimed because the branch has not been pushed yet. `Final` remains `Planned` until final `main` verification.

**Feature-branch evidence (Issue 12A / #30, `feature/12a-my-tickets-ux-refinement`, local verification before PR handoff):** contract-first TDD changed My Tickets search from Summary/Description to Ticket Number/Summary, added Ticket Number sorting, replaced desktop sort dropdowns with accessible sortable headers plus mobile-equivalent sort controls, moved Clear Filters beside Create Ticket, and removed the Action/Open column while retaining Ticket Number as a real detail link. Failing-first API checks exposed the old Description search and missing Ticket Number search/sort behavior; failing-first UI checks exposed the old placeholder, dropdown sorting, toolbar placement, and Open-action model. After the minimal implementation, client Vitest **50/50 passed**, server Vitest/Supertest **85/85 passed**, full Playwright **7/7 passed** (`E2E-01` now searches by the generated Ticket Number; `A11Y-01` covers the sortable controls), client/server `tsc --noEmit` passed, both builds passed, and `git diff --check` completed without whitespace errors. The first updated A11Y run failed only because the old broad `Priority` label locator became ambiguous after accessible sort labels were added; narrowing that filter locator to exact `Priority` resolved the test-harness issue, and the full rerun passed 7/7. Hosted CI is not yet claimed because this branch has not been pushed. `Final` remains `Planned` until final `main` verification.

**Feature-branch evidence (Issue 12B / #31, `feature/12b-create-ticket-back-navigation`, local verification before PR handoff):** contract-first TDD added `UI-26` for consistent top-right `Back to My Tickets` navigation on Create Ticket and loaded Requester Ticket Detail. Failing-first component tests produced exactly two expected failures because neither screen had that link; the remaining existing tests stayed green. Minimal implementation added responsive heading/action rows using real React Router links to `/my-tickets`, kept Create Ticket bottom actions as Submit + Clear, and left Ticket/Attachment mutation behavior untouched. Targeted Create/Detail component tests then passed **15/15**; full client Vitest passed **52/52**, full server Vitest/Supertest passed **85/85**, and full Playwright passed **7/7**. `A11Y-01` tabs to and activates both new Back links with visible focus; `E2E-05` re-captures Create Ticket and Ticket Detail at 1440/900/375 with no horizontal page scrolling. Client/server `tsc --noEmit` passed, both builds passed, and `git diff --check` completed without whitespace errors. Hosted CI is not yet claimed because this branch has not been pushed. `Final` remains `Planned` until final `main` verification.

**Feature-branch evidence (Issue 12C / #34, `feature/12c-my-tickets-readability-ticket-date`, final local verification before PR handoff):** contract-first TDD refined My Tickets with five visibly labelled toolbar controls (`Search`, `Category`, `Requested Priority`, `Current Status`, `Rows per page`), added strict `currentStatus=NEW` list filtering without adding status mutation, exposed official `ticketDate` in list items, moved Created directly after Ticket Number, and made Created sortable through existing `sort=ticketDate`. The desktop/tablet table now uses an explicit seven-column fixed layout; sortable/non-sortable headers share uniform typography; the table header uses a muted light Zen Green surface with darker green text so it remains subordinate to the primary app header; neutral white/light-gray zebra rows separate data without reusing the header color; Summary keeps its full DOM value while a two-line CSS line clamp/ellipsis keeps row density consistent. Failing-first tests exposed the absent Current Status filter / Created sort UI and the API's previous rejection of `currentStatus=NEW`. After minimal implementation, targeted My Tickets UI passed **22/22** and targeted My Tickets API passed **37/37**; final full client Vitest passed **55/55**, full server Vitest/Supertest passed **88/88**, full Playwright passed **7/7**, client/server `tsc --noEmit` passed, both builds passed, and `git diff --check` completed without whitespace errors. A local 50-ticket stress dataset measured no horizontal page/table overflow at 1440/900/768 and stable column widths across All / Current Status / long-category / short-category result sets; muted-header contrast measured **6.58:1** in Chromium. One earlier Playwright invocation did not start because a stale local Vite process occupied port 5174; after stopping only that stale repository process, unchanged code reran **7/7 passed**. Final My Tickets responsive screenshots plus empty/no-results state screenshots were regenerated as materially changed evidence. No hosted CI is claimed yet because the branch has not been pushed. `Final` remains `Planned` until final `main` verification.

**Feature-branch evidence (Issue 13 / #19, `feature/13-release-integration`, PR #36):** final integration closed the planned Unit/API/Requester Selection evidence gaps and added narrowly scoped release/submission hardening without introducing a new user-facing feature. Evidence-gap tests for existing reference-data and Requester Selection behavior were allowed to pass immediately; they are not retroactively claimed as Red→Green implementation. New hardening used failing-first evidence: `getNextSequence()` initially returned `10000` instead of signaling exhaustion after `9999`; `formatTicketNumber()` initially allowed an out-of-range five-digit sequence; and `listTickets()` initially accepted missing/non-parseable `ticketDate` plus a parseable but non-ISO-UTC timestamp. Those failures were corrected with minimal production changes. Added `UNIT-01`…`UNIT-04`, `API-01`…`API-03`, `UI-15`…`UI-17`, `UI-21`, and client API-boundary coverage. `ticketDate` is now a required typed list field and must be a valid ISO 8601 UTC timestamp at the client boundary while the UI `—` remains defensive only. E2E-01 no longer waits on `POST /api/tickets`; it synchronizes on the visible Official Ticket Number and passed **5/5 consecutive local repetitions**. E2E-05 now proves both page-level no-overflow and visible My Tickets `.table-responsive` wrapper no-overflow at desktop/tablet widths. `VISUAL-01` now retains explicit Requester Selection loading/failure evidence and the Labsheet-required one-valid/one-invalid attachment selection state. Latest full local regression after the Labsheet audit: server Vitest/Supertest **100/100 passed**, client Vitest **64/64 passed**, full Playwright **7/7 passed**, client/server `tsc --noEmit` passed, both production builds passed, and `git diff --check` passed. Three tracked-evidence additions were retained: `requester-loading.png`, `requester-failure.png`, and `invalid-attachment.png`; unrelated regenerated screenshots were restored. PR #36 received a `CHANGES_REQUESTED` evidence-sync review, was corrected, then approved by @Tanaboonnnnn at exact final head `c763999…` and peer-merged into `lab2-staging` as `e213b00…`; exact reviewed-head and post-merge hosted CI passed client/server/e2e. All `Final` cells remain `Planned` until exact final-`main` verification.

**Release follow-up evidence (Issue 14 / #38, PR #39):** a focused My Tickets sort-refresh change keeps already-loaded desktop table rows and mobile cards mounted while the replacement sort request is pending, exposes refresh state with `aria-busy`, and preserves the existing initial/requester-switch loading path and request-sequence guard. Failing-first component evidence reproduced the prior table unmount; the corrected exact head `5394b7e…` passed the targeted My Tickets suite **23/23**, full client Vitest **65/65**, client typecheck/build, `A11Y-01`, and `git diff --check`. @Tanaboonnnnn approved the exact head and recorded one non-blocking point: the deferred regression test triggers sort through the desktop control while asserting both desktop and mobile results rather than directly clicking the mobile control in that same test. The peer merged PR #39 into `lab2-staging` as `42ad3bc…`; exact post-merge staging push CI and PR #37 CI on that head passed client/server/e2e. `Final` remains `Planned` until final-main verification.

**Current release review (PR #37):** @thananun-7203 reviewed staging head `42ad3bc…`, found no production-code blocker, and submitted `CHANGES_REQUESTED` for documentation/evidence synchronization: `ui-spec.md` §9 still showed a future unchecked Issue-12 checklist, and `reviewer.md` had not recorded completed PR #36 evidence. The review also correctly noted as non-blocking that `path.resolve("uploads")` resolves from `process.cwd()` rather than being inherently cwd-independent. A deeper `docs/lab-02` audit found three planned-test/path mismatches as well: `API-22` had no direct partial-upload scenario, while `UI-12`/`UI-13` pointed at `AttachmentSection.test.tsx` even though that file did not prove the planned Create Ticket behaviors. This release correction therefore adds narrow evidence-gap tests at `server/tests/lab-02/initial-attachment-failure.api.test.ts` and `client/src/features/lab-02/tests/CreateTicketAttachments.test.tsx` and synchronizes the test-plan paths. These are evidence closure for already-implemented behavior, not retroactive Red→Green product claims. No corrected-head test/CI success, PR #37 approval, merge, or final-main success is claimed until the new head is actually verified.

## 7. Known Limitations or Deferred Tests

- Asia/Bangkok display formatting uses deterministic `Intl.DateTimeFormat.formatToParts` output and is covered by the My Tickets component test; Issue 11 provides responsive screenshots and Issue 12 executed the full visual checklist in §4.
- `STYLE-01`…`STYLE-05`, `UI-19`, and `UI-20` are no longer deferred: Issue 12 adds their automated feature-branch evidence in `client/src/features/lab-02/tests/ui-style.test.tsx`. Their `Final` cells remain `Planned` solely because final-main verification has not occurred yet.
- The earlier Create Ticket coverage debt was corrected by Issue #27 / PR #28: `API-04`…`API-07`, `API-23`, `UI-01`…`UI-05`, `UI-18`, and `UI-22` now have automated files/evidence. The API-07 expected-result wording was narrowed during Issue 12 to match what the test proves (requester binding/persistence at creation) without changing BR-08 itself.
- Issue 13 added the previously missing `UNIT-01`…`UNIT-04`, `API-01`…`API-03`, `UI-15`…`UI-17`, and `UI-21` feature-branch evidence. Their `Final` cells intentionally remain `Planned` until exact final-`main` verification.
- The PR #37 release audit corrected stale `API-22` / `UI-12` / `UI-13` evidence paths by adding direct tests for the existing partial-upload and Create Ticket invalid-selection behavior; these rows still remain `Planned` until exact final-main verification.
- Backend idempotency keys are out of scope in Lab 2 (AC-05 enforced at UI layer per api-spec §7).
- AC-25/AC-26 already have automated failure-state evidence. For the final submission, the Labsheet permits either stopping the backend or simulating failure; use the deterministic failure screenshot/test evidence and add a live backend-stop demonstration only if it improves the final explanation.
