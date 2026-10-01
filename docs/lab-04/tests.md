# Lab 4 Test Plan — TokTickIT Actions Taken, Workflow Gate, Dashboards, and Hardening

Companion to [specification.md](./specification.md), [api-spec.md](./api-spec.md), and [ui-spec.md](./ui-spec.md). Created before Lab 4 implementation. New behavior is tested failing-first; already-correct Lab 1–3 behavior is closed as regression evidence, never claimed as retroactive Red→Green cycles. These Test IDs are the canonical Test IDs for AC traceability (one AC maps to many Tests).

**Final-status rule:** every row starts `Planned`. `Final = Pass` is allowed only after the corresponding automated evidence passes on the exact final `main` release tree. Retry or flaky outcomes are reported truthfully. Forbidden words in this plan's verdicts: `PASS` without evidence, `100% COMPLETE`, `DONE`.

**Path convention:** `server/tests/lab-04/*` and `e2e/lab-04/*` are To be created. `client/src/features/lab-04/tests/*` is To be created (mirroring the Lab 3 layout). Existing suites are named by their current paths.

## 1. Test Strategy

| Level | Tool | Purpose |
|---|---|---|
| Unit | Vitest | action validation incl. date bounds, gate predicate, cycle logic, dashboard aggregation |
| API / integration | Supertest + Vitest | actions CRUD/lifecycle/history, gate + cycles, dashboards with drill-down params |
| Security / authorization | Supertest + Vitest | role matrix, cross-owner access, dashboard scope, history visibility, note isolation |
| Database | Vitest + Prisma | version increments, FK/unique constraints, event immutability, lock behavior |
| Migration / regression | Prisma + Vitest/Supertest | additive migration, legacy resolvability, seed idempotency, Lab 1–3 green |
| UI component | Vitest + Testing Library | dashboards, ActionsTaken flows incl. transitions and history, workflow feedback |
| UI style | Vitest | Zen Green continuity, badges, read-only vs editable distinction |
| Responsive / accessibility / visual | Playwright | 1440/900/375, keyboard and focus, screenshots with checklist |
| E2E | Playwright | action flow, resolution journey with cycles, dashboard journeys, cross-role |
| Performance-smoke | Vitest/Playwright timers | dashboard response measured on seeded data (measure-only; no tuning without numbers) |

Security-sensitive behavior is proved at the backend boundary. A hidden button or route is NOT authorization evidence.

## 2. Planned Unit Tests (`server/src/lib/__tests__/` — To be created unless noted)

| ID | Type | Requirement / AC | What It Tests | Expected Result | Automated Test File | Final |
|---|---|---|---|---|---|---|
| UNIT-01 | Unit | BR-005–BR-007, AC-002 | action field validation: lengths, follow-up-note iff flag, work-date bounds (empty, null, malformed, boundary, min/max) | pre-Ticket and future dates rejected; in-range accepted | `action-validation.test.ts` | Planned |
| UNIT-02 | Unit | BR-011–BR-013, AC-010–AC-013 | gate predicate over (completed-in-cycle, open-in-cycle) incl. legacy and post-reopen cycles | blocked unless ≥1 current-cycle completion with zero non-terminal | `resolution-gate.test.ts` | Planned |
| UNIT-03 | Unit | BR-017–BR-022, AC-014–AC-016 | dashboard aggregation: attribution splits, urgent vs recent separation, top-N, empty | counts, order, and empty outputs match contract; no time-zone math | `dashboard-metrics.test.ts` | Planned |
| UNIT-04 | Unit | BR-003, AC-004 | lifecycle transition table (all pairs incl. forbidden) | only specified transitions allowed; skip-to-complete rejected | `action-lifecycle.test.ts` | Planned |

## 3. Planned API / Integration Tests

### Actions Taken — `server/tests/lab-04/actions-taken.api.test.ts` (To be created)

| ID | Type | Requirement / AC | What It Tests | Expected Result | Final |
|---|---|---|---|---|---|
| API-01 | API | AC-001 | Staff creates a valid action | `201` under correct Ticket; performer is auth user; `PLANNED`, version 1, current cycle, `CREATED` event | Planned |
| API-02 | API | BR-005–BR-007, AC-002 | invalid bodies: bad lengths, note-without-flag, flag-without-note, pre-Ticket/future/malformed date, bad assignee, forged performer/status/version fields | `400` (`ACTION_DATE_OUT_OF_RANGE` for dates) or `409` per contract; no partial write | Planned |
| API-03 | API | AC-003 | edit `PLANNED`/`IN_PROGRESS` vs terminal action; actions on terminal Ticket; stale `expectedVersion`; repeated edit | edits succeed with exact version increments; terminal → `409`; stale → `409 ACTION_STATE_CHANGED` | Planned |
| API-04 | API | AC-004 | `PLANNED → IN_PROGRESS` via update; skip-to-complete; unknown state; backward move | start succeeds + event; all others `409 INVALID_ACTION_TRANSITION` | Planned |
| API-05 | API | AC-005 | complete without result; complete with result; cancel from both open states; mutate after terminal | result-less complete rejected; terminal afterwards; later edits `409` | Planned |
| API-06 | API | AC-008 | inactive/Requester assignee at assign and complete; unassigned complete by eligible performer | `409 ACTION_ASSIGNEE_NOT_ELIGIBLE` where ineligible; performer path succeeds | Planned |
| API-07 | API / concurrency | BR-024, AC-008, AC-017 | assign/complete racing Admin deactivate/demote as real overlapping DB operations | loser safe `409`; ineligible final state never commits | Planned |
| API-08 | API | AC-009 | Requester create/edit/transition/complete/cancel/history attempts; cross-owner list/history | `403` or safe `404`; owned list and history complete | Planned |
| API-09 | API | AC-018 | double-submit same `clientRequestId`; same key on another Ticket; distinct concurrent creates | single record replayed; scope is per-Ticket; distinct creates both persist | Planned |

### History — same file, event rows

| ID | Type | Requirement / AC | What It Tests | Expected Result | Final |
|---|---|---|---|---|---|
| API-10 | API | AC-007 | event appended on create, edit, assign, transition, complete, cancel | one ordered event per mutation with actor, timestamp, type, payload, request id | Planned |
| API-11 | API | AC-007 | route inventory for event mutation; direct update/delete attempts at ORM level rejected by contract | no update/delete event route exists; negative tests prove absence | Planned |
| API-12 | API | AC-007 | history ordering under rapid successive mutations; actor identity on each event | deterministic `occurredAt, id` order; actors match callers | Planned |

### Ticket workflow + gate + cycles — `server/tests/lab-04/ticket-workflow.api.test.ts` (To be created)

| ID | Type | Requirement / AC | What It Tests | Expected Result | Final |
|---|---|---|---|---|---|
| API-13 | API | AC-010 | resolve with non-terminal action via direct API bypass | `409 RESOLUTION_BLOCKED_BY_OPEN_ACTIONS` with `openActionIds`; nothing mutates | Planned |
| API-14 | API | AC-010 | resolve with zero completions but no open actions | `409 RESOLUTION_REQUIRES_COMPLETED_ACTION` with `currentCycle` | Planned |
| API-15 | API | AC-011 | resolve after current-cycle completion with zero open | succeeds per matrix | Planned |
| API-16 | API | AC-012 | resolve legacy zero-action Ticket | rejected until one current-cycle completion (design decision under test) | Planned |
| API-17 | API | AC-013 | reopen → new cycle; old-cycle completions do not satisfy new gate | cycle increments; history kept; gate re-armed | Planned |
| API-18 | API | AC-010–AC-013 | full final matrix incl. every forbidden transition (contract-first update of Lab 3 cases) | allowed accepted; unlisted `409` | Planned |
| API-19 | API / concurrency | BR-024, AC-017 | resolve racing concurrent action completion (real overlapping ops) | gate evaluated atomically; no bypass possible | Planned |
| API-20 | API / concurrency | BR-023, AC-017 | stale-version concurrent edits and transitions (A reads v3, B commits v4, A submits v3) | A receives `409 ACTION_STATE_CHANGED`; final version exact | Planned |

### Dashboards — `server/tests/lab-04/requester-dashboard.api.test.ts`, `staff-dashboard.api.test.ts` (To be created)

| ID | Type | Requirement / AC | What It Tests | Expected Result | Final |
|---|---|---|---|---|---|
| API-21 | API | AC-014 | requester metrics and recents incl. zero-ticket Requester; malformed auth | owned-only data; zeros with `[]`, never `404` or leakage | Planned |
| API-22 | API | AC-015 | staff attribution metrics (`ownedByMe`, `assignedToMe`, `performedByMe`) vs direct DB queries | each metric matches its own query; no merged counting | Planned |
| API-23 | API | AC-015 | urgent (`urgentHighPriority`) vs recent (`recentlyUpdated`) separation; drill-down link targets incl. priority sort | urgent = `HIGH`/`CRITICAL` only; links well-formed | Planned |
| API-24 | API | AC-016 | Admin `userCounts` shape; Staff omission; Requester denial; shape scan | exact shape; no key for Staff; `403` for Requester; no PII | Planned |

### Migration / regression — `server/tests/lab-04/migration-regression.test.ts` (To be created)

| ID | Type | Requirement / AC | What It Tests | Expected Result | Final |
|---|---|---|---|---|---|
| MIG-01 | Migration | BR-026, AC-019 | additive migration on Lab 3 snapshot incl. new tables, FKs, indexes, defaults, version default | Lab 1–3 rows intact; constraints hold | Planned |
| MIG-02 | Migration / seed | BR-027–BR-028, AC-019 | clean seed, rerun idempotency, 0/1/N distribution, lifecycle/cycle variety, zero-metric fixtures | no duplicates; mutations preserved; coverage complete | Planned |
| REG-01 | Regression | FR-019, AC-020 | Lab 1–3 server, client, and E2E suites incl. contract-first status-test updates | green on the exact tree | existing suites | Planned |

## 4. Security / Authorization Tests

| ID | Type | Requirement / AC | What It Tests | Expected Result | Automated Test File | Final |
|---|---|---|---|---|---|---|
| SEC-01 | Security | matrix, AC-009 | role × action matrix over every new endpoint incl. ID manipulation and event paths | backend matches matrix regardless of UI | `actions-taken.api.test.ts` | Planned |
| SEC-02 | Security | BR-017, AC-014 | cross-Requester dashboard, Ticket, and history access incl. id guessing | safe `403`/`404` with zero leakage | `requester-dashboard.api.test.ts` | Planned |
| SEC-03 | Security | AC-020 | Internal Notes absence from every new response shape | no note field or content anywhere | notes regression + new-shape scans | Planned |

## 5. UI Component Tests (`client/src/features/lab-04/tests/` — To be created)

| ID | Type | Requirement / AC | What It Tests | Expected Result | Automated Test File | Final |
|---|---|---|---|---|---|---|
| UI-01 | UI | AC-014 | RequesterDashboard: cards, lists, loading, empty, failure, drill-down, keyboard | matches API; all states reachable | `RequesterDashboard.test.tsx` | Planned |
| UI-02 | UI | AC-015, AC-016 | StaffDashboard: attribution cards, urgent vs recent, Admin counts, zero, failure, drill-down; card absent for Staff | counts exact; navigation correct | `StaffDashboard.test.tsx` | Planned |
| UI-03 | UI | AC-001–AC-006, AC-008 | ActionsTaken: list, create (auto-tick), edit, start, complete, cancel, conflict and date-range feedback; history view; Requester read-only | Staff flows succeed; history read-only rendered; Requester has no controls | `ActionsTaken.test.tsx` | Planned |
| UI-04 | UI | AC-010, AC-011, AC-013 | TicketWorkflow: gate-blocked explanation (open vs missing-completion), summary refresh, reopened-cycle presentation | blocker copy with links; success refreshes; fresh cycle shown | `TicketWorkflow.test.tsx` | Planned |
| UI-05 | UI | drill-down contract | lists initialize filters/sort from query; User Management role init; unknown values ignored | filters match query; safe defaults otherwise | `DrillDown.test.tsx` | Planned |
| STYLE-01 | Style | ui-spec §1/§5 | Zen Green continuity, status badges (`PLANNED` etc., never `OPEN`/`WORKING`), read-only vs editable | conforms | `dashboard-actions-style.test.tsx` | Planned |

## 6. E2E / Accessibility / Visual (`e2e/lab-04/` — To be created)

| ID | Type | Requirement / AC | What It Tests | Expected Result | Automated Test File | Final |
|---|---|---|---|---|---|---|
| E2E-01 | E2E | AC-001–AC-009 | staff full action flow (create → start → edit → complete → history) with requester read-only check | consistent with API state end to end | `actions-taken-flow.spec.ts` | Planned |
| E2E-02 | E2E | AC-010–AC-013 | blocked resolve → complete → resolve → close → reopen → resolve-again journey | gate visible, passes, re-arms | `ticket-resolution.spec.ts` | Planned |
| E2E-03 | E2E | AC-014–AC-016 | both dashboards with drill-down into filtered lists; ownership held | correct scope and navigation | `dashboards.spec.ts` | Planned |
| A11Y-01 | E2E / accessibility | ui-spec §9 | keyboard-only dashboard, action, and history flows | reachable and operable; focus visible; dialogs trap with Escape and focus return; labels correct | `accessibility.spec.ts` | Planned |
| VISUAL-01 | Responsive / visual | ui-spec §8 | 1440/900/375 screenshots of all major Lab 4 screens | no clipping, overlap, or page horizontal scroll; continuity held | `visual-states.spec.ts` | Planned |
| PERF-01 | Perf-smoke | contract §9 | dashboard API and UI response measured on seeded data | numbers recorded; no tuning claims made | `dashboard-perf.spec.ts` | Planned |

## 7. Acceptance-Criterion Traceability Matrix

| AC | Planned Test IDs |
|---|---|
| AC-001 create | API-01, UI-03, E2E-01 |
| AC-002 validation/dates | UNIT-01, API-02, UI-03, E2E-01 |
| AC-003 edit | API-03, API-20, UI-03, E2E-01 |
| AC-004 start transition | UNIT-04, API-04, UI-03, E2E-01 |
| AC-005 complete | API-05, UI-03, E2E-01 |
| AC-006 cancel | API-05, UI-03, E2E-01 |
| AC-007 history | API-10–API-12, SEC-01, UI-03, E2E-01 |
| AC-008 assign/eligibility | API-06, API-07, UI-03, E2E-01 |
| AC-009 requester visibility | API-08, SEC-01, UI-03, E2E-01 |
| AC-010 gate block | UNIT-02, API-13, API-14, UI-04, E2E-02 |
| AC-011 gate pass | UNIT-02, API-15, UI-04, E2E-02 |
| AC-012 legacy cycle | UNIT-02, API-16, E2E-02 |
| AC-013 reopen cycle | UNIT-02, API-17, UI-04, E2E-02 |
| AC-014 requester dashboard | UNIT-03, API-21, SEC-02, UI-01, E2E-03 |
| AC-015 staff dashboard | UNIT-03, API-22, API-23, UI-02, E2E-03 |
| AC-016 admin counts | UNIT-03, API-24, UI-02, E2E-03 |
| AC-017 concurrency | API-07, API-19, API-20 (real overlapping operations; sequential-only does not count) |
| AC-018 idempotency | API-09, UI-03, E2E-01 |
| AC-019 migration/seed | MIG-01–MIG-02 |
| AC-020 regression | REG-01, SEC-03, A11Y-01, VISUAL-01 |

Coverage rule: every AC maps to at least one automated test whose scenario directly exercises that criterion. Broad regression claims never substitute for specific boundary tests.

## 8. Planned Test-File Map by Implementation Issue

| GitHub Issue (7 issues; single combined dashboards issue per owner decision) | Primary planned evidence |
|---|---|
| Contract (#75) | this plan with peer review; no code |
| Actions Taken foundation | `actions-taken.api.test.ts` (API-01–API-12), unit validation/lifecycle/gate tests, migration and seed tests, version/concurrency/idempotency proofs |
| Actions Taken UI | `ActionsTaken.test.tsx`, `dashboard-actions-style.test.tsx` |
| Ticket workflow + gate + cycles | `ticket-workflow.api.test.ts` (API-13–API-20), `TicketWorkflow.test.tsx` |
| Role dashboards (combined) | `requester-dashboard.api.test.ts`, `staff-dashboard.api.test.ts`, both dashboard UI tests, `DrillDown.test.tsx` |
| Final hardening | E2E, accessibility, visual, perf-smoke suites, REG-01, SEC-03, screenshots under `artifacts/lab-04/screenshots/` |
| Release | exact staging and main full-suite verification with the submission PDF |

## 9. Commands and Isolation Contract

```bash
# server unit + API/integration/security/migration tests
cd server && npm test

# client component + style tests
cd client && npm test

# Playwright E2E/accessibility/visual
npx playwright test
```

The PostgreSQL test database stays separate from development data through `TEST_DATABASE_URL` with the repository's fail-closed guard. Tests use deterministic fixtures with targeted cleanup and MUST NEVER destructively target the development database. Time-dependent tests use injected clocks, never real waiting. Concurrency tests use real overlapping database operations.

## 10. Responsive and Visual Checklist

- [ ] Dashboards and the Actions area at 1440/900/375: cards wrap, tables collapse to cards on mobile, no clipping, overlap, or horizontal page scroll.
- [ ] Lifecycle states (`PLANNED`/`IN_PROGRESS`/`COMPLETED`/`CANCELLED`) distinguishable without color-only cues; follow-up flag explicit; history visually append-only.
- [ ] Gate-blocker copy readable with links to the Actions tab.
- [ ] Loading, empty, forbidden, conflict, and failure states distinct; focus, keyboard, and dialog behaviors work.
- [ ] Screenshots under `artifacts/lab-04/screenshots/{staff-dashboard,requester-dashboard,actions-taken}/`; paths are recorded only after the files exist.

## 11. Final Results

Not yet available. Statuses used: `SPECIFIED` (planned here), `IMPLEMENTED`, `LOCALLY VERIFIED`, `CI VERIFIED`, `EVIDENCE CAPTURED`, `APPROVED`, `MERGED`. Evidence levels (feature-branch local → exact-head hosted CI → post-merge staging → exact final-main) are recorded truthfully; only final-main evidence advances status. The words `PASS`, `100% COMPLETE`, and `DONE` MUST NOT appear as verdicts without supporting evidence.

## 12. Known Deferred / Out-of-Scope Tests

SLA, escalation, and notification tests; billing and payroll; multi-approval and signatures; BI and export; multi-tenant coverage; any feature outside the approved contract (sheet §4.2).
