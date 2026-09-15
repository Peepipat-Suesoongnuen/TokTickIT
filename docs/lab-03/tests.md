# Lab 3 Test Plan — TokTickIT Authentication, Staff Workflow, and Administration

Companion to [specification.md](./specification.md), [api-spec.md](./api-spec.md), and [ui-spec.md](./ui-spec.md). This plan is created before Lab 3 implementation. Tests are added failing-first where new behavior does not yet exist; regression/evidence tests for already-correct Lab 2 behavior may legitimately pass on first execution and must be described as evidence closure rather than retroactively claimed as a Red→Green implementation cycle.

**Final-status rule:** every planned row starts `Planned`. Feature-branch/staging evidence may be recorded later, but `Final = Pass` is allowed only after the corresponding automated evidence passes on the exact final `main` release tree. Retry/flaky outcomes are reported truthfully rather than flattened into a clean first-pass claim.

## 1. Test Strategy

| Level | Tool | Purpose |
|---|---|---|
| Unit | Vitest | password policy, email normalization, auth/session helpers, lockout state, status transition rules, comment/note validation |
| API / integration | Supertest + Vitest | auth/session lifecycle, Requester ownership, Staff workflow, Admin safety, strict contracts, safe errors |
| Security / authorization | Supertest + Vitest | direct unauthorized-role/object access, internal-note isolation, stale sessions, CSRF/origin/CORS boundaries, SQLi-like/XSS-like input |
| Migration / regression | Prisma + Vitest/Supertest | preserve Lab 2 users/tickets/attachments/reference data; selector removal; IT Priority initialization; seed idempotency |
| UI component | Vitest + Testing Library | Login, Change Password, role shell, Requester/Staff/Admin screens and state feedback |
| UI style | Vitest | Zen Green continuity, badges, public/private communication distinction, editable/read-only states |
| Responsive / accessibility / visual | Playwright | desktop/tablet/mobile behavior, keyboard/focus/dialog semantics, screenshots/checklist |
| E2E | Playwright | full Requester, IT Staff, Administrator and cross-role communication flows |

Security-sensitive behavior is proved at the backend boundary. Hiding a button or route is not accepted as authorization evidence.

## 2. Planned Unit Tests

### `server/src/lib/__tests__/`

| ID | Type | Requirement / AC | What It Tests | Expected Result | Automated Test File | Final |
|---|---|---|---|---|---|---|
| UNIT-01 | Unit | BR-08, AC-02 | password policy min/max by Unicode code point, upper/lower/special, current-password difference | 8/64 boundaries accepted including multibyte Unicode; 7/65 rejected; input is not silently truncated/normalized | `server/src/lib/__tests__/password-policy.test.ts` | Planned |
| UNIT-02 | Unit | BR-40, BR-46, AC-13 | email trim/lowercase canonicalization and comparison | canonical value stable; case-only variants collide | `server/src/lib/__tests__/identity.test.ts` | Planned |
| UNIT-03 | Unit | BR-16, AC-03 | absolute session-expiry calculation | valid before 8h; expired at exactly 8h; no sliding extension | `server/src/lib/__tests__/session.test.ts` | Planned |
| UNIT-04 | Unit | BR-25–BR-33, AC-11 | complete status-transition matrix including forbidden transitions | only approved transitions reported allowed; `NEW→OPEN` reserved for Claim/Assign | `server/src/lib/__tests__/ticket-status.test.ts` | Planned |
| UNIT-05 | Unit | BR-36–BR-38, AC-12 | Public Comment/Internal Note trim + channel-specific length validation | Comment whitespace/0/>200 rejected; Note whitespace/0/>2000 rejected; valid text normalized | `server/src/lib/__tests__/message-validation.test.ts` | Planned |
| UNIT-06 | Unit | BR-13, AC-01, AC-03 | failed-login counter / lock / expiry / reset state helper | fifth bad password locks 15m; success resets before threshold; reset operation clears state | `server/src/lib/__tests__/login-protection.test.ts` | Planned |
| UNIT-07 | Unit | BR-10, AC-02, AC-18 | Argon2id hash/verify wrapper and encoded parameters | hash is PHC Argon2id with unique salt and at least `m=19456,t=2,p=1`; ASCII and multibyte valid passwords verify; wrong password fails; plaintext is not stored | `server/src/lib/__tests__/password-hash.test.ts` | Planned |

## 3. Planned API / Integration Tests

### Authentication — `server/tests/lab-03/auth.api.test.ts`

| ID | Type | Requirement / AC | What It Tests | Expected Result | Final |
|---|---|---|---|---|---|
| API-01 | API | AC-01 | valid active login | `200`, safe User, opaque session cookie established | Planned |
| API-02 | API | BR-01, BR-09, AC-01 | nonexistent email, wrong password, inactive user, locked account | safe generic account-specific failure; no state disclosure | Planned |
| API-03 | API | BR-13, AC-01 | five consecutive bad passwords + lock expiry/reset behavior | fifth failure locks; correct password rejected during lock; later succeeds after expiry | Planned |
| API-04 | API | BR-15, AC-03 | `GET /api/auth/me` | only safe user fields; no credential/security internals | Planned |
| API-05 | API | BR-07, BR-60, AC-03 | logout then reuse prior session | logout `204`; protected request afterward `401`; repeat logout harmless | Planned |
| API-06 | API | BR-02, BR-57, AC-02 | mandatory-password account calls normal API | login succeeds but normal endpoint `403 PASSWORD_CHANGE_REQUIRED` | Planned |
| API-07 | API | BR-08, BR-10, BR-12, BR-61, AC-02 | valid/invalid password change including multibyte Unicode boundaries | valid 8–64-code-point passwords including multibyte input succeed and clear mandatory state; invalid/wrong-current causes no partial change | Planned |
| API-08 | API | BR-16, AC-03 | controllable-clock session expiry boundary | before expiry authorized; exactly at expiry `401` | Planned |
| API-09 | API | BR-17, AC-03 | successful user password change invalidates old sessions | old contexts fail; one fresh context remains usable | Planned |
| API-10 | API | BR-18, BR-62, AC-15 | Admin initial-password reset invalidates target sessions | target old sessions fail; new initial login requires change | Planned |

### Requester / Lab 2 regression — `server/tests/lab-03/requester-regression.api.test.ts`

| ID | Type | Requirement / AC | What It Tests | Expected Result | Final |
|---|---|---|---|---|---|
| API-11 | API | BR-03, AC-04 | create Ticket under authenticated Requester | persisted requester is auth user; no requesterId authority | Planned |
| API-12 | API | BR-03, BR-65, AC-04 | old `requesterId` supplied in create/list/detail/attachment request | rejected as unknown/invalid input; never changes auth ownership | Planned |
| API-13 | API | BR-20, AC-04, AC-05 | Requester B lists/opens A Ticket | A data absent; direct protected detail returns safe `404` | Planned |
| API-14 | API | BR-51, AC-05 | My Tickets search/filter/sort/pagination with eight statuses | Lab 2 semantics preserved except authenticated identity + expanded status enum | Planned |
| API-15 | API | BR-51, AC-05 | Requester Attachment upload/metadata/download/remove lifecycle | Lab 2 type/size/count/soft-remove/ownership behavior remains green | Planned |
| API-16 | API | AC-06 | Requester detail owner display contract | owner `{id,name}` or null returned; no owner email/internal notes | Planned |
| API-17 | API | BR-34–BR-38, AC-06, AC-12 | own Public Comments GET/POST | append-only, backend author/time, trim + 1–200, deterministic order | Planned |
| API-18 | API | BR-05, AC-06 | Problem Appears Resolved state matrix + idempotency | `NEW/OPEN/IN_PROGRESS/WAITING_FOR_REQUESTER/REOPENED` may set indication without status change; repeat in allowed state keeps timestamp; `RESOLVED/CLOSED/CANCELLED` return `409 INVALID_TICKET_STATE` with no mutation | Planned |

### Staff Queue — `server/tests/lab-03/staff-queue.api.test.ts`

| ID | Type | Requirement / AC | What It Tests | Expected Result | Final |
|---|---|---|---|---|---|
| API-19 | API | FR-09, AC-08 | Staff/Admin Queue access; Requester direct call | Staff/Admin `200`; Requester `403` | Planned |
| API-20 | API | AC-08 | Queue search Ticket Number/Summary/Requester name/email | case-insensitive partial; Description-only term excluded | Planned |
| API-21 | API | AC-08 | filters category/requestedPriority/itPriority/status/owner | exact matching data only; `unassigned`, `me`, owner ID semantics | Planned |
| API-22 | API | AC-08 | sort/default rank/pagination | explicit priority rank + deterministic defaults; valid `meta`; page > total safe empty | Planned |
| API-23 | API | BR-65, AC-18 | unknown/duplicate/invalid Queue query | `400` strict contract; no unsafe dynamic query structure | Planned |

### Staff Detail / ownership / priority / status — `server/tests/lab-03/staff-workflow.api.test.ts`

| ID | Type | Requirement / AC | What It Tests | Expected Result | Final |
|---|---|---|---|---|---|
| API-24 | API | FR-10, AC-07 | Staff/Admin shared Ticket Detail; Requester staff route | authorized detail `200`; Requester `403` | Planned |
| API-25 | API | BR-27, BR-69, AC-09 | first Claim of unassigned `NEW` | owner + `NEW→OPEN` committed atomically | Planned |
| API-26 | API / concurrency | BR-70, AC-09 | two concurrent Claims | exactly one success; loser `409 TICKET_ALREADY_ASSIGNED`; one final owner | Planned |
| API-27 | API | BR-23, BR-29, BR-70, AC-09 | assign/reassign + stale expectedOwnerId | eligible active owner accepted; reassignment preserves status; stale `409` | Planned |
| API-28 | API | BR-22, BR-45, AC-09 | ineligible owner / closed-cancelled standalone owner update | inactive/Requester owner rejected; frozen terminal ownership enforced | Planned |
| API-29 | API | BR-24, BR-70, AC-10 | IT Priority update + stale expected | IT Priority changes only; Requested Priority preserved; stale `409` | Planned |
| API-30 | API | BR-25–BR-33, AC-11 | every allowed status transition | all listed transitions accepted under owner invariants | Planned |
| API-31 | API | BR-25–BR-33, AC-11 | forbidden/unlisted status transitions | `409 INVALID_STATUS_TRANSITION`; direct `NEW→OPEN` rejected | Planned |
| API-32 | API | BR-22, BR-32, AC-11 | `CLOSED→REOPENED` with eligible vs ineligible historical owner | keep eligible owner; otherwise require/atomically set replacement owner | Planned |
| API-33 | API | AC-11 | Reopen clears Requester resolution indication | `requesterResolutionIndicatedAt = null` atomically | Planned |

### Internal Notes / communication — `server/tests/lab-03/notes.api.test.ts`

| ID | Type | Requirement / AC | What It Tests | Expected Result | Final |
|---|---|---|---|---|---|
| API-34 | API | BR-04, AC-07, AC-12 | Requester calls Internal Notes route | `403`; no note content returned | Planned |
| API-35 | API | BR-34–BR-38, AC-12 | Staff/Admin Internal Notes GET/POST | append-only, backend author/time, trim + 1–2000, deterministic order | Planned |
| API-36 | API | BR-04, AC-12 | Requester detail/comments response leakage check | no `internalNotes` property or note content anywhere | Planned |
| API-37 | API | BR-30, AC-12 | Requester comments while Waiting | comment saved; status remains `WAITING_FOR_REQUESTER` | Planned |

### Administrator — `server/tests/lab-03/admin-users.api.test.ts`

| ID | Type | Requirement / AC | What It Tests | Expected Result | Final |
|---|---|---|---|---|---|
| API-38 | API | FR-15, BR-65, AC-13 | Admin list/search + optional role filter only | safe fields only; case-insensitive name/email search; exact optional role filter; Status is returned but `active`/Status query is rejected as unlisted input | Planned |
| API-39 | API | FR-16, BR-08, BR-10, BR-39–BR-40, AC-13 | create user | exactly one role; canonical unique email; valid ASCII/multibyte 8–64-code-point initial password is Argon2id-hashed; invalid policy rejected; `mustChangePassword=true` | Planned |
| API-40 | API | BR-40, BR-46, AC-13 | duplicate case-variant email | `409 EMAIL_ALREADY_EXISTS` | Planned |
| API-41 | API | BR-42, AC-14 | self-deactivation | atomic `409 CANNOT_DEACTIVATE_SELF` | Planned |
| API-42 | API / concurrency | BR-43, AC-14 | last active Administrator including concurrent safety | cannot reach zero active Admins | Planned |
| API-43 | API | BR-45, AC-14 | deactivate/role-away active Ticket owner | `409 USER_HAS_ACTIVE_TICKETS`; historical Closed/Cancelled owner does not block | Planned |
| API-44 | API | BR-47, AC-14 | multi-field invalid user update | no partial update; final state unchanged | Planned |
| API-45 | API | BR-08, BR-10, BR-44, BR-62, AC-15 | set new initial password | valid ASCII/multibyte policy accepted and Argon2id-hashed; invalid policy causes no partial change; on success mandatory change true, lock reset, all target sessions revoked, no secret response | Planned |
| API-46 | API | AC-07, AC-13 | IT Staff/Requester call `/api/admin/*` | `403` before protected User detail is exposed | Planned |

## 4. Security / Authorization Tests

Security rows may share implementation files with API rows, but remain separately traceable because they prove hostile/unauthorized behavior rather than only functional happy paths.

| ID | Type | Requirement / AC | What It Tests | Expected Result | Automated Test File | Final |
|---|---|---|---|---|---|---|
| SEC-01 | Security | BR-19, AC-07 | direct API authorization matrix across Requester/Staff/Admin | backend results match matrix regardless of hidden/shown UI controls | `server/tests/lab-03/authorization.api.test.ts` | Planned |
| SEC-02 | Security | BR-20, AC-04 | object-level Ticket/Attachment ownership bypass attempts | other Requester protected resources are safe `404` | `server/tests/lab-03/authorization.api.test.ts` | Planned |
| SEC-03 | Security | BR-04, BR-73, AC-12, AC-18 | Internal Note leakage scan | Requester responses never include note field/content | `server/tests/lab-03/notes.api.test.ts` | Planned |
| SEC-04 | Security | BR-74, AC-18 | SQLi-like search/filter input and sort allow-list | input treated as data; unsafe sort/query structure rejected; no query semantics injection | `server/tests/lab-03/security.api.test.ts` | Planned |
| SEC-05 | Security | BR-65, AC-18 | unknown JSON fields/query params and identity/author/timestamp spoof fields | `400`; security authority not overridden | `server/tests/lab-03/security.api.test.ts` | Planned |
| SEC-06 | Security | BR-55, BR-58, BR-72, AC-18 | Origin/CSRF boundary for all state-changing routes including Login | exact approved Origin works; missing Origin, `Origin: null`, and unapproved Origin each return safe `403 ORIGIN_NOT_ALLOWED` before account/resource-specific processing; rejected origins receive no credentialed CORS authorization | `server/tests/lab-03/security.api.test.ts` | Planned |
| SEC-07 | Security | BR-10, BR-15, BR-73, AC-18 | sensitive response/log-facing response fields | no password/hash/raw token/tokenHash/counters/lock timestamp returned | `server/tests/lab-03/security.api.test.ts` | Planned |
| SEC-08 | Security | BR-37, BR-74, AC-12, AC-18 | XSS-like `<script>` text in user-authored content | stored/returned as text; client component renders text, no executable HTML path | `server/tests/lab-03/security.api.test.ts`; `client/src/features/lab-03/tests/security-rendering.test.tsx` | Planned |
| SEC-09 | Security | BR-14, AC-03 | deactivate authenticated user then reuse old session | next protected request `401` | `server/tests/lab-03/auth.api.test.ts` | Planned |
| SEC-10 | Security | BR-09, AC-01, AC-18 | login error equivalence | email-not-found/wrong/inactive/locked avoid account-enumerating response details | `server/tests/lab-03/auth.api.test.ts` | Planned |

## 5. Migration / Regression Tests

### `server/tests/lab-03/migration-regression.test.ts`

These tests use controlled fixtures / migration snapshots and never destructively target the development database.

| ID | Type | Requirement / AC | What It Tests | Expected Result | Final |
|---|---|---|---|---|---|
| MIG-01 | Migration | BR-49, AC-16 | Lab 2 DevelopmentRequester → User mapping | every existing Ticket requester points to the correct evolved User | Planned |
| MIG-02 | Migration | BR-50, AC-16 | existing Tickets/Attachments/Categories/RelatedSystems preserved | counts/identities/critical metadata remain valid; no discard/recreate shortcut | Planned |
| MIG-03 | Migration | BR-24, AC-16 | existing Ticket IT Priority initialization | `itPriority == requestedPriority` after migration | Planned |
| MIG-04 | Migration | BR-10, BR-52, AC-16 | migrated Requester credential state | password is an Argon2id non-plaintext hash with approved baseline parameters; `mustChangePassword=true`; local credential rule documented | Planned |
| MIG-05 | Migration / seed | BR-75, AC-16 | clean baseline + non-destructive idempotent rerun | clean seed creates ≥4 active +1 inactive Requester, ≥3 active +1 inactive Staff, ≥1 active Admin without duplicates; after mutating seeded user password/role/activation/mandatory-lock state and Ticket owner/IT Priority/status/resolution indication, rerun preserves those mutations | Planned |
| MIG-06 | Migration / seed | AC-16 | realistic seeded Ticket distribution/comments/notes | statuses/priorities/assigned-unassigned represented; no sensitive sample content | Planned |
| REG-01 | Regression | BR-51, AC-05 | Lab 2 Requester server suite adapted to auth | create/list/detail/attachments behaviors remain correct | Planned |

## 6. UI Component Tests

### `client/src/features/lab-03/tests/`

| ID | Type | Requirement / AC | What It Tests | Expected Result | Automated Test File | Final |
|---|---|---|---|---|---|---|
| UI-01 | UI | AC-01 | Login initial/busy/generic failure/rate-limit/server failure | accessible fields; one submit; safe feedback; values handled correctly | `Login.test.tsx` | Planned |
| UI-02 | UI | AC-02 | Mandatory Change Password | password requirements checklist below confirmation; eye-icon show/hide controls; invalid validation; busy; success continuation; balanced Logout; no Forgot Password flow | `ChangePassword.test.tsx` | Planned |
| UI-03 | UI | AC-07, AC-17 | role-aware shell | correct nav/user/role/actions per role; Logout/Change Password visible; no Change Requester | `AppShell.test.tsx` | Planned |
| UI-04 | UI / regression | AC-05 | Create Ticket without selector | authenticated Requester shown read-only; Lab 2 validation/busy/success/failure preserved; `My Tickets > Create Ticket` breadcrumb present | `RequesterCreateTicket.test.tsx` | Planned |
| UI-05 | UI / regression | AC-05 | My Tickets with eight statuses | Lab 2 seven columns/search/filter/sort/pagination/card states preserved; Summary one-line ellipsis; compact WAITING display remains mapped to `WAITING_FOR_REQUESTER`; no Owner column | `RequesterMyTickets.test.tsx` | Planned |
| UI-06 | UI | AC-06 | Requester Detail additions | detail retains My Tickets fields including Req. Priority/Status/Last Updated; Assigned To/Unassigned; breadcrumb; Public Comments; `Ticket Actions` availability matches the appears-resolved status matrix; no Internal Notes | `RequesterTicketDetail.test.tsx` | Planned |
| UI-07 | UI | AC-08, AC-17 | Staff Queue | approved filters/sort; eight desktop columns (Ticket No., Summary, Category, Req. Priority, IT Priority, Status, Owner, Updated); one-line Summary/Category/Owner; aligned badges; mobile cards; loading/empty/no-results/forbidden/failure | `StaffQueue.test.tsx` | Planned |
| UI-08 | UI | AC-09–AC-11 | Staff Detail operations | Queue fields remain visible in detail; plain-text requester indication; breadcrumb/tab layout; Claim/Owner/IT Priority/status controls reflect state; stale conflict refresh feedback | `StaffTicketDetail.test.tsx` | Planned |
| UI-09 | UI | AC-12, AC-17 | Public vs Internal communication | explicit private label/lock semantic; composers stay above timelines; Public Comment uses compact 200-char control; Internal Note uses multiline/auto-grow textarea with 2000-char counter/validation; aligned actions; no color-only distinction | `TicketCommunication.test.tsx` | Planned |
| UI-10 | UI | AC-13 | Admin list/create/edit/reset | Search + optional Role filter with Clear/Refresh/Create; no Status filter; Name/Email/Role/Status columns; row/card opens Edit without Edit button; consistent role/status badges; required fields/one role; eye-icon password visibility; no password echo; responsive semantics | `AdminUsers.test.tsx` | Planned |
| UI-11 | UI | AC-14 | Admin safety/conflict feedback | self/last-admin/active-owner messages are actionable and preserve edit input | `AdminUsers.test.tsx` | Planned |
| UI-12 | UI | AC-17, AC-18 | shared auth/common states | `401→Login`, password gate→Change Password, forbidden/not-found/safe failure routing and copy | `AppAuthStates.test.tsx` | Planned |
| UI-13 | UI / regression | AC-05, AC-17 | Attachment component Lab 2 regression | upload/download/remove/readability/modal semantics remain green | existing Lab 2 tests + `RequesterTicketDetail.test.tsx` | Planned |

## 7. UI Style / Accessibility Unit-Level Assertions

| ID | Type | Requirement / AC | What It Tests | Expected Result | Automated Test File | Final |
|---|---|---|---|---|---|---|
| STYLE-01 | Style | ui-spec §1, AC-17 | Zen Green base tokens/classes retained | Lab 3 shell/primary actions reuse documented tokens | `client/src/features/lab-03/tests/ui-style.test.tsx` | Planned |
| STYLE-02 | Style | ui-spec §8, AC-17 | priority/status/role badge semantics and table alignment | text always present; consistent fixed-height bordered family; left edge aligns with column header/data start; `NEW` has no decorative dot; `CLOSED` uses the approved muted family consistent with `LOW`; not color-only | same | Planned |
| STYLE-03 | Style | ui-spec §6, AC-12, AC-17 | Public vs Internal Notes distinction | private section has explicit text/icon/semantic distinction beyond color | same | Planned |
| STYLE-04 | Style / a11y | ui-spec §11, AC-17 | visible focus / first-invalid-field / dialogs | focus rules remain aligned with Lab 2 conventions | same | Planned |

## 8. End-to-End / Accessibility / Visual Tests

### `e2e/lab-03/`

| ID | Type | Requirement / AC | What It Tests | Expected Result | Automated Test File | Final |
|---|---|---|---|---|---|---|
| E2E-01 | E2E | AC-01, AC-02, AC-05 | Requester first login → mandatory change → Create Ticket → find My Tickets → Detail → Attachment/Public Comment | normal app unavailable until change; generated Ticket discoverable; Lab 2 flow continues under auth | `e2e/lab-03/requester-auth-ticket-flow.spec.ts` | Planned |
| E2E-02 | E2E | AC-08–AC-12 | IT Staff login → Queue → claim → priority → In Progress/Waiting/Resolved → comments + internal note | Staff workflow follows contract; UI/API state consistent | `e2e/lab-03/staff-ticket-flow.spec.ts` | Planned |
| E2E-03 | E2E / cross-role | AC-06, AC-12 | Requester/Staff communication and resolution indication | Requester sees Public Comment but never Internal Note; appears-resolved visible to Staff without status mutation | `e2e/lab-03/requester-staff-communication.spec.ts` | Planned |
| E2E-04 | E2E | AC-11 | formal lifecycle incl. Close/Reopen | transition sequence and confirmations work; reopen owner repair covered where fixture requires | `e2e/lab-03/status-workflow.spec.ts` | Planned |
| E2E-05 | E2E | AC-13–AC-15 | Admin list/create/edit/reset + target next-login change | minimalist admin flow works; safety conflicts visible; target forced to change reset initial password | `e2e/lab-03/admin-users.spec.ts` | Planned |
| E2E-06 | E2E / security | AC-03, AC-04, AC-07, AC-18 | logout/direct URL/direct API unauthorized attempts | protected access blocked after logout; cross-role/object attempts fail safely | `e2e/lab-03/security-regression.spec.ts` | Planned |
| E2E-07 | E2E / regression | AC-05 | authenticated Requester Lab 2 regression suite | Create/My Tickets/Detail/Attachment behavior remains green | `e2e/lab-03/requester-regression.spec.ts` | Planned |
| A11Y-01 | E2E / accessibility | AC-17 | keyboard-only representative Auth/Requester/Staff/Admin flows | controls reachable/operable; visible focus; dialogs trap/Esc/return focus; labels correct | `e2e/lab-03/accessibility.spec.ts` | Planned |
| VISUAL-01 | Responsive / visual | AC-17 | representative 1440/900/375 screenshots + state captures | no clipping/overlap/page horizontal scroll; Zen Green continuity; private/public distinction readable | `e2e/lab-03/visual-states.spec.ts` | Planned |

## 9. Acceptance-Criterion Traceability Matrix

| AC | Planned Test IDs |
|---|---|
| AC-01 Authentication | UNIT-06, API-01–03, SEC-10, UI-01 |
| AC-02 Mandatory Password Change | UNIT-01, UNIT-07, API-06–07, UI-02, E2E-01 |
| AC-03 Session Lifecycle | UNIT-03, API-04–05, API-08–10, SEC-09, E2E-06 |
| AC-04 Requester Identity Security | API-11–13, SEC-02, E2E-06 |
| AC-05 Lab 2 Requester Regression | API-14–15, REG-01, UI-04–05, UI-13, E2E-01, E2E-07 |
| AC-06 Requester Lab 3 Features | API-16–18, UI-06, E2E-03 |
| AC-07 Authorization | API-19, API-24, API-34, API-46, SEC-01, UI-03, E2E-06 |
| AC-08 Staff Queue | API-19–23, UI-07, E2E-02 |
| AC-09 Ownership | API-25–28, UI-08, E2E-02 |
| AC-10 IT Priority | API-29, UI-08, E2E-02 |
| AC-11 Status Workflow | UNIT-04, API-30–33, UI-08, E2E-02, E2E-04 |
| AC-12 Communication | UNIT-05, API-17, API-34–37, SEC-03, SEC-08, UI-09, E2E-02–03 |
| AC-13 Administrator User Management | UNIT-02, API-38–40, API-46, UI-10, E2E-05 |
| AC-14 Administrator Safety | API-41–44, UI-11, E2E-05 |
| AC-15 Initial Password Reset | UNIT-01, UNIT-06, UNIT-07, API-10, API-45, E2E-05 |
| AC-16 Migration and Seed | MIG-01–06 |
| AC-17 UI/UX | UI-01–13, STYLE-01–04, A11Y-01, VISUAL-01 |
| AC-18 Safe Failure and Security | UNIT-07, API-23, SEC-01–10, UI-12, E2E-06, VISUAL-01 |

Coverage rule: every AC maps to at least one automated test whose scenario directly exercises that criterion. Broad “full regression” claims do not substitute for specific boundary tests.

## 10. Planned Test-File Map by Implementation Issue

This keeps Issue execution aligned with the engineering contract while allowing exact file names to be refined only when the implementation structure genuinely requires it.

| GitHub Issue | Primary planned evidence |
|---|---|
| #44 User migration/schema/seed | `migration-regression.test.ts`, migration/seed helpers, shared Argon2id password-hash helper + `password-hash.test.ts` evidence needed to create migrated/seeded credentials |
| #45 Authentication | `auth.api.test.ts`, shared `password-hash.test.ts`, password/session/login-protection unit tests, Login/ChangePassword UI tests; consumes the approved Argon2id helper established with #44 |
| #46 Authorization + Requester regression | `requester-regression.api.test.ts`, `authorization.api.test.ts`, Requester UI regression tests |
| #47 Staff Queue | `staff-queue.api.test.ts`, `StaffQueue.test.tsx` |
| #48 Staff workflow | `staff-workflow.api.test.ts`, `StaffTicketDetail.test.tsx`, status unit tests |
| #49 Comments/Notes | `notes.api.test.ts`, communication UI tests, security rendering tests |
| #50 Admin | `admin-users.api.test.ts`, `AdminUsers.test.tsx` |
| #51 E2E/security/visual | all `e2e/lab-03/*`, final cross-feature security/visual gaps |
| #52 Release | exact staging/main full-suite verification and truthful evidence synchronization |

## 11. Test Commands and Isolation Contract

Expected top-level commands continue the repository conventions:

```bash
# server unit + API/integration/security/migration tests
cd server && npm test

# client component + style tests
cd client && npm test

# Playwright E2E/accessibility/visual
npx playwright test
```

Database rules:

- PostgreSQL test database is separate from development data using `TEST_DATABASE_URL` or the repository’s approved equivalent.
- Migrations/seed for tests target the same isolated test database that Vitest/Supertest use.
- Tests use deterministic fixtures and targeted cleanup; never use broad destructive cleanup against the development database.
- Migration-preservation tests use controlled pre-Lab-3 fixture/snapshot data so “preservation” is actually proved.
- Auth/session time tests use fake/injected clock behavior rather than waiting real minutes/hours.
- Concurrency tests use real conditional/transactional behavior, not only mocked sequential calls.

## 12. Responsive and Visual Checklist

Planned execution at representative `1440`, `900`, and `375` widths where relevant:

- [ ] Zen Green header/actions/tokens remain continuous with Lab 2.
- [ ] Login/Change Password fit without clipping and safe error/validation states are readable.
- [ ] Requester Create/My Tickets/Detail preserve Lab 2 hierarchy after selector removal.
- [ ] Requester My Tickets remains seven-column desktop/tablet with mobile cards and no Owner column.
- [ ] Staff Queue uses the approved eight-column information hierarchy with one-line/clamped Summary/Category/Owner and readable mobile cards; no horizontal page scroll.
- [ ] Staff Detail makes editable operational fields distinguishable from read-only Ticket information.
- [ ] Public Comments vs Internal Notes are unmistakably different without relying on color alone; Internal Note composition is multiline/auto-grow rather than a forced one-line field.
- [ ] Admin list/create/edit/reset works desktop/mobile; Search + optional Role filter and Clear/Refresh/Create actions are present; no Status list filter is introduced; row/card interaction replaces an Edit column/button; dialogs fit viewport.
- [ ] status/priority/role badges include text and remain readable.
- [ ] dense IT Staff/Admin desktop data screens may widen to approximately 1360 px while Requester screens preserve the Lab 2 ~1200 px baseline; no horizontal page scroll is introduced.
- [ ] table priority/status/role highlights use consistent fixed-height borders and align their left edge with the corresponding column header/data start.
- [ ] `NEW` status has no decorative leading dot, and `CLOSED` uses the approved muted visual family consistent with `LOW` priority.
- [ ] loading/saving/success/validation/empty/no-results/forbidden/not-found/failure states are visually distinct where required.
- [ ] visible focus, keyboard reachability, modal/dialog trap/Escape/focus-return behaviors work.
- [ ] no unintended horizontal page scrolling; no blocking clipping/overlap.

Planned screenshots are stored under `artifacts/lab-03/screenshots/` by role/screen/state. Final paths will be recorded only after the screenshots actually exist.

## 13. Final Results

Not yet available. This document is the pre-implementation plan. No `Pass` result, branch evidence, staging CI, reviewer approval, or final-main evidence is claimed until it actually exists.

When implementation begins, evidence entries should distinguish:

1. feature-branch local evidence;
2. exact reviewed-head hosted CI;
3. exact post-merge `lab3-staging` evidence; and
4. exact final-`main` evidence.

Only item 4 changes the authoritative `Final` column from `Planned` to `Pass` (or a truthful qualified result such as `Pass (retry)`).

## 14. Known Deferred / Out-of-Scope Tests

- OAuth/OIDC/SSO/MFA/social login are out of Lab 3 scope.
- Email invitation/reset delivery is out of scope.
- Standalone Unlock User UI/API is out of scope.
- Status-history/audit-trail tests are deferred with the feature itself.
- Comment/note edit/delete and attachments are out of scope.
- Actions Taken/SLA/escalation/notification tests are deferred to later labs.
- Production cloud/infrastructure penetration testing is outside this course increment; application-level security boundaries remain required and planned above.
