# Lab 4 Sprint Engineering Specification — TokTickIT Actions Taken, Dashboards, and Final Regression

Companion contract to [api-spec.md](./api-spec.md), [ui-spec.md](./ui-spec.md), and [tests.md](./tests.md). This document evolves the completed Lab 3 increment. Where Lab 4 does not explicitly replace a Lab 3 behavior, the Lab 3 contract remains the regression baseline (Lab 4 sheet §8.5).

> Status: NORMATIVE CONTRACT for implementation (Issue #75). RFC 2119 keywords apply. Each rule carries its source: [Sheet §X] = Lab 4 Labsheet, [Lab3] = inherited regression rule, [D = Decision §11.N] = project design decision with rationale. Nothing here is proposal or example text.
> Owner decisions locked: ORD-01 two dashboard routes, ORD-02 work-date input + auto-tick with honest-time rule, ORD-03 Admin user counts included.

## 1. Sprint Goal

**Goal.** Complete the core TokTickIT service-desk workflow in one sprint.
**Problem.** The desk receives Tickets and communicates (Labs 1–3) but cannot plan, track, or prove the actual work; resolution is not gated on work completion; no operational summaries exist.
**Outcome.** Actions Taken with a demonstrable lifecycle and immutable history under every Ticket; a backend-enforced per-cycle resolution gate; role-appropriate dashboards with drill-down; the full Lab 1–3 application preserved and hardened.
**Lab 4 relation.** This specification implements Labsheet Sections 3–8 (product), §9 (this document), and defines the acceptance basis for §10 (tests), §12 (repository), §13 (DoD), and §14 (submission Parts 2, 5–9).

## 2. Stakeholder Request

### Requester
- **Need.** Know what is happening on my Tickets without seeing internal work.
- **Requested capability.** Read-only view of Actions Taken on owned Tickets; a personal dashboard of owned work.
- **Business value.** Fewer status-chasing contacts; trust through visible progress.

### IT Staff
- **Need.** Plan, record, and hand over real work per Ticket with demonstrable states.
- **Requested capability.** Create/edit/transition/complete/cancel Actions Taken; operational dashboard (my assignments, unassigned pool, urgent vs recent work).
- **Business value.** Accountable, auditable work records; triage without opening every Ticket.

### Administrator
- **Need.** Same operational view as Staff plus account oversight.
- **Requested capability.** Full Staff behavior; concise user-account counts with role drill-down.
- **Business value.** Staffing and access decisions from one screen.

### System / Auditor
- **Need.** Provable integrity of work records and resolution decisions.
- **Requested capability.** Immutable event history; resolution gated on completed work per cycle; server-side authorization everywhere.
- **Business value.** Every resolution and metric is reproducible from stored data.

## 3. Scope

### 3.1 In-Scope
`ActionTaken` model with `PLANNED → IN_PROGRESS → COMPLETED / CANCELLED` lifecycle; immutable `ActionTakenEvent` history; additive migration and idempotent seed; Actions Taken REST APIs (create, read, update, transition, complete, cancel, history); per-cycle backend resolution gate; Requester dashboard (`/dashboard`); Staff dashboard (`/staff-dashboard`) with current-user attribution and urgent work; Administrator user-account counts; drill-down into filtered lists; Lab 1–3 regression; responsive/accessible hardening; evidence and release integration.

### 3.2 Explicitly Out-of-Scope (Sheet §4.2 — implementation MUST NOT add these)
Automatic SLA clocks, escalation engines, on-call scheduling, breach notifications; email, SMS, LINE, push, or other external notification services; inventory, spare-parts, purchasing, cost accounting; time-sheet billing, payroll, labor-cost calculation; multi-level approval workflows, electronic signatures; advanced BI tools, custom report builders, export warehouses; multi-tenant organizations, production-scale cloud operations; any product feature not approved in this contract.

## 4. Functional Requirements

Format per FR: requirement, actor, preconditions, main flow, alternative/error flow, expected result, related BR/AC/Rubric.

- **FR-001 Create Action.** Actor: IT Staff/Administrator. Pre: authorized visibility on a non-terminal Ticket. Flow: submit valid fields → server sets performer, `PLANNED` status, `version = 1`, cycle = current Ticket cycle, audit event. Alt: terminal Ticket / invalid input / ineligible assignee / out-of-range date → rejected, nothing stored. Result: stored Action + `CREATED` event. BR: BR-001–BR-002, BR-006–BR-008, BR-026. AC: AC-001, AC-002. Rubric: Part 6.
- **FR-002 View Actions.** Actor: any authorized role. Pre: Ticket visible to caller. Flow: list returns all items in stable order with full fields (Requester sees owned Tickets only). Result: ordered list, never partial. BR: BR-008. AC: AC-009. Rubric: Parts 6, 8.
- **FR-003 Edit Action.** Actor: Staff-side. Pre: Action in `PLANNED` or `IN_PROGRESS` on a non-terminal Ticket; caller supplies `expectedVersion`. Flow: validate → apply → `version + 1` → `UPDATED` event. Alt: terminal state/ticket, stale version, ineligible assignee → rejected. Result: updated Action or safe conflict. BR: BR-003–BR-004, BR-023–BR-024, BR-009. AC: AC-003, AC-017. Rubric: Part 6.
- **FR-004 Start Action (transition).** Actor: Staff-side. Pre: Action `PLANNED`. Flow: `PLANNED → IN_PROGRESS` with version check → `STATUS_CHANGED` event. Alt: any other transition → rejected. Result: demonstrable intermediate state. BR: BR-003. AC: AC-004. Rubric: Part 6.
- **FR-005 Complete Action.** Actor: Staff-side. Pre: Action `IN_PROGRESS`; non-empty result; accountable person (assignee if set, else performer) eligible at commit. Flow: validate → `COMPLETED` → event. Alt: missing result / ineligible person / stale version → rejected. Result: terminal Action with result. BR: BR-003–BR-004. AC: AC-005. Rubric: Part 6.
- **FR-006 Cancel Action.** Actor: Staff-side. Pre: Action `PLANNED` or `IN_PROGRESS`. Flow: `→ CANCELLED` with version check → event. Result: terminal Action, never blocks resolution. BR: BR-003. AC: AC-006. Rubric: Part 6.
- **FR-007 Assign Action.** Actor: Staff-side. Pre: target user active Staff-side. Flow: set `assignedToId` with version check → `ASSIGNED` event. Alt: ineligible target → rejected. Result: accountable assignee recorded. BR: BR-002, BR-024. AC: AC-008, AC-017. Rubric: Part 6.
- **FR-008 View History.** Actor: authorized role (Requester: owned Tickets). Flow: return append-only event stream for an Action in creation order. Result: complete audit trail; no update/delete path exists. BR: BR-010. AC: AC-007. Rubric: Parts 6, 7.
- **FR-009 Requester Read-Only.** Actor: Requester. Pre: owned Ticket. Result: full Action view; every create/change API path denies with `403`. BR: BR-008. AC: AC-009. Rubric: Parts 6, 8.
- **FR-010 Gate Resolution.** Actor: Staff-side resolving a Ticket. Pre: `IN_PROGRESS`/`WAITING_FOR_REQUESTER`. Flow: server checks current-cycle gate → resolve or reject with blocker detail. Alt: bypass attempt → same enforcement. Result: `RESOLVED` only when the gate holds. BR: BR-011–BR-015. AC: AC-010–AC-013. Rubric: Part 7.
- **FR-011 Reopen.** Actor: Staff-side. Pre: `RESOLVED`/`CLOSED`. Flow: transition to `REOPENED`, increment Ticket cycle, preserve all history → new cycle starts empty. Result: gate re-arms for the new cycle. BR: BR-015–BR-016. AC: AC-013. Rubric: Part 7.
- **FR-012 Requester Dashboard.** Actor: Requester at `/dashboard`. Result: owned-only metrics and lists with drill-down. BR: BR-017, BR-022. AC: AC-014. Rubric: Part 8.
- **FR-013 Staff Dashboard.** Actor: Staff-side at `/staff-dashboard`. Result: operational metrics with current-user attribution (assigned to me, performed by me, owned by me), urgent work separated from recent updates, drill-down. BR: BR-018, BR-022. AC: AC-015. Rubric: Part 5.
- **FR-014 Admin Counts.** Actor: Administrator. Result: Staff view plus `{ total, active, byRole }` with role drill-down; Staff response omits the key. BR: BR-019–BR-021. AC: AC-016. Rubric: Part 5.
- **FR-015 Drill-Down.** Actor: dashboard user. Flow: activate a metric → target list opens with the matching filter initialized. Result: listed rows match the metric definition. BR: BR-022. AC: AC-014–AC-016. Rubric: Parts 5, 8.
- **FR-016 Validation & Errors.** Actor: any API caller. Result: strict contracts — malformed input, unknown fields, bad enums, out-of-range dates fail closed with safe codes and no partial writes. BR: BR-005–BR-007. AC: AC-002. Rubric: Parts 6, 7.
- **FR-017 Concurrency & Idempotency.** Actor: concurrent API callers. Result: version-checked mutations with `409` on stale writes; lock-ordered transactions; retried creates with the same key return the original record. BR: BR-023–BR-025. AC: AC-017–AC-018. Rubric: Parts 3, 6, 7.
- **FR-018 Migration & Seed.** Actor: operator/CI. Result: additive migration preserving Lab 1–3 data; idempotent seed with required distributions. BR: BR-026–BR-028. AC: AC-019. Rubric: Parts 2, 3.
- **FR-019 Regression.** Actor: all users. Result: every Lab 1–3 behavior not explicitly replaced keeps working. BR: [Lab3]. AC: AC-020. Rubric: Part 8.
- **FR-020 Honest Date Entry.** Actor: Staff-side creating/editing. Result: work-date input with auto-now tick inside provable bounds; immutable audit timestamp recorded. BR: BR-007. AC: AC-002. Rubric: Part 6.

## 5. Business Rules

### 5.1 Action Taken Lifecycle
- **BR-001** An Action Taken belongs to exactly one Ticket. [Sheet]
- **BR-002** The Ticket Owner coordinates the Ticket, but an Action Taken MAY be performed by a different IT Staff member. [Sheet]
- **BR-003** Lifecycle states are `PLANNED` (initial) → `IN_PROGRESS` → `COMPLETED`, with `PLANNED → CANCELLED` and `IN_PROGRESS → CANCELLED` as the only other transitions. All other transitions, including any move out of a terminal state, are forbidden. [D §11.1 — intermediate state required for demonstrable workflow]
- **BR-004** Completion requires status `IN_PROGRESS`, a non-empty result, and an accountable person — the assignee when one is set, otherwise the performer — eligible (active `IT_STAFF`/`ADMINISTRATOR`) at commit time. `performedBy` ALWAYS means the recorder: the authenticated user who created the Action; it is immutable and MUST NOT be reinterpreted as the assignee or the completer. Completion MAY be performed by any authorized Staff-side user with Ticket visibility (not necessarily the assignee); the completer's identity is recorded as the `COMPLETED` event actor, never by mutating `performedById`. Cancellation requires no result. [Sheet + D]
- **BR-005** `followUpNote` (1–500 characters after trim) is required if and only if `followUpRequired` is true. [D — sheet requires the note-when-needed pair]
- **BR-006** Description is 1–1,000 characters after trim. Result is 0–2,000 characters. Attachment notes are 0–500 characters of free-text guidance referencing files to inspect, NOT a foreign key to Attachment. [D — sheet requires the fields, lengths are contract values]
- **BR-007** `actionDate` is the claimed work datetime (input or auto-now tick). The backend MUST accept it only within `[ticket.ticketDate, now + 1h tolerance]` and MUST reject the rest with `400 ACTION_DATE_OUT_OF_RANGE`. `createdAt` is an immutable system audit timestamp. [D §11.11 with prototype evidence]
- **BR-008** Requester action reads derive ownership from authenticated identity. Staff/Admin reads require authorized Ticket visibility. Hidden UI controls are NOT authorization. [Sheet §4.3]
- **BR-009** Actions Taken on a `RESOLVED`, `CLOSED`, or `CANCELLED` Ticket are immutable and read-only, even when their status is non-terminal (inherited Lab 3 frozen-terminal principle extended to `RESOLVED`: a resolved Ticket with later-added work would silently violate the gate it just passed). Create, edit, transition, complete, and cancel on such Tickets MUST be rejected with `409 INVALID_ACTION_TRANSITION`. Further work requires Reopen first. [Lab3]

### 5.2 Complete Action Taken
Covered by BR-003/BR-004 plus: the result MUST be stored before the terminal transition commits; `performedById` is set once from authenticated identity at creation and MUST NEVER change; the client MUST NOT supply or override performer identity (unknown field → `400`).

### 5.3 Append-only Audit History
- **BR-010** Every Action Taken mutation MUST append `ActionTakenEvent` rows: exactly one event per changed aspect, in the fixed order `STATUS_CHANGED`, `ASSIGNED`, `FOLLOW_UP_CHANGED`, `UPDATED`, sharing one request correlation id and ordered by (`occurredAt`, `id`). `FOLLOW_UP_CHANGED` fires when `followUpRequired`/`followUpNote` changes. Events are INSERT-only at the application layer: the application MUST expose no update or delete path for events (DB triggers are out of course scope; the guarantee is application-enforced plus FK integrity). Each event records actor, server timestamp, event type, ActionTaken id, the minimal before/after payload, and the request correlation id.

### 5.4 Status Transition Tables

Ticket (Lab 3 matrix + gate; forbidden set unchanged):

| Current State | Allowed Next State | Actor | Preconditions | Forbidden Case |
|---|---|---|---|---|
| `NEW` | `OPEN` | Staff/Admin | First Claim/Assign, atomic | Direct generic-endpoint transition |
| `NEW`, `OPEN`, `IN_PROGRESS`, `WAITING_FOR_REQUESTER`, `REOPENED` | `CANCELLED` | Staff/Admin | Explicit cancel | From `RESOLVED`/`CLOSED` |
| `OPEN` | `IN_PROGRESS` | Staff/Admin | Explicit | — |
| `IN_PROGRESS`, `WAITING_FOR_REQUESTER` | `RESOLVED` | Staff/Admin | Gate BR-011–BR-013 holds | Gate violated |
| `WAITING_FOR_REQUESTER` | `IN_PROGRESS` | Staff/Admin | Explicit | Requester auto-transition |
| `RESOLVED` | `CLOSED` | Staff/Admin | UI confirmation | — |
| `RESOLVED`, `CLOSED` | `REOPENED` | Staff/Admin | New cycle starts (BR-015) | — |
| `REOPENED` | `IN_PROGRESS` | Staff/Admin | Explicit | — |
| `CANCELLED` | — | — | Terminal | Any outbound transition |

Action Taken:

| Current State | Allowed Next State | Actor | Preconditions | Forbidden Case |
|---|---|---|---|---|
| `PLANNED` | `IN_PROGRESS` | Staff/Admin | Version check | Skip to `COMPLETED` |
| `PLANNED`, `IN_PROGRESS` | `CANCELLED` | Staff/Admin | Version check | — |
| `IN_PROGRESS` | `COMPLETED` | Staff/Admin | Non-empty result; eligible accountable person; version check | Missing result / ineligible person |
| `COMPLETED`, `CANCELLED` | — | — | Terminal | Any outbound transition |
| any (terminal Ticket) | — | — | BR-009 | Any mutation |

### 5.5 Authorization Matrix

| Action | Requester | IT Staff | Admin | Server Enforcement |
|---|---|---|---|---|
| View Actions Taken | Own Ticket only | Authorized Ticket | Authorized Ticket | Ownership/visibility check per request |
| Create / edit / transition / complete / cancel Action | Deny (`403`) | Allow on authorized non-terminal Ticket | Allow on authorized non-terminal Ticket | Role + visibility + state check |
| View Action history | Own Ticket only | Authorized Ticket | Authorized Ticket | Same as view |
| Resolve Ticket | Deny (advisory only) | Allow (gate enforced) | Allow (gate enforced) | Gate check atomic with transition |
| Reopen Ticket | Deny | Allow | Allow | Role + state check |
| Requester dashboard | Own only | Deny (`403`) | Deny (`403`) | Role guard |
| Staff dashboard | Deny (`403`) | Allow | Allow (+ counts) | Role guard; counts key Admin-only |
| User counts | Deny | Deny (key omitted) | Allow | Role guard + projection |
| User Management | Deny | Deny | Allow | Unchanged Lab 3 |

UI visibility, disabled controls, and hidden routes are presentation only and MUST NEVER substitute for the server checks above.

### 5.6 Resolution Gate and Cycles
- **BR-011** A Ticket MAY move to `RESOLVED` only from `IN_PROGRESS` or `WAITING_FOR_REQUESTER` AND only when the current cycle holds ≥1 `COMPLETED` Action Taken. [D §11.14 — sheet requires backend enforcement of the completion rule]
- **BR-012** The same move additionally requires zero non-terminal (`PLANNED`/`IN_PROGRESS`) Actions in the current cycle. [Sheet]
- **BR-013** Follow-up is handled exactly when its Action reaches a terminal state (`COMPLETED` or `CANCELLED`) with the note preserved; hence BR-012 already enforces follow-up handling — no separate flag check exists. [D]
- **BR-014** A Ticket with zero Actions Taken (including legacy Tickets) MUST NOT resolve merely for having nothing outstanding: it MUST first complete ≥1 Action in its current cycle. [D §11.15 — deliberate, documented deviation from pure Lab 3 regression: untracked work MUST NOT count as evidence of resolution]
- **BR-015** Reopen starts a new resolution cycle: the Ticket cycle counter increments, new Actions attach to the new cycle, and only current-cycle Actions satisfy the gate. Previous cycles remain as history and MUST NEVER auto-satisfy a new gate. [D]
- **BR-016** The Lab 3 transition matrix is otherwise unchanged.
- **BR-029** Ticket cycle persistence: `Ticket.resolutionCycle` (integer, `NOT NULL`, default `1`, §7.0) is the sole source of truth for the current cycle. Reopen MUST increment it atomically with the status change under the §7.3 lock order; concurrent reopens MUST serialize so the counter advances exactly once per committed reopen. Gate checks and Action creation MUST read the Ticket row value; deriving the cycle from child rows is FORBIDDEN. Backfill of existing Tickets to `1` is deterministic and covered by migration tests.

### 5.7 Reopen
Reopen is Staff/Admin-only, from `RESOLVED` or `CLOSED` to `REOPENED`. No mandatory reason text is required (Lab 3 had none; decision recorded). All existing Actions keep their states as history. The gate re-arms: the new cycle starts with zero completed Actions, so the Ticket MUST earn resolution again. Ineligible historical owners are replaced atomically per the Lab 3 rule.

### 5.8 Dashboards
- **BR-017** Requester metrics, strictly owned-scope: `openTickets` (owned non-terminal), `waitingForRequester` (owned `WAITING_FOR_REQUESTER`), `recentlyUpdated` (owned, top 5), `recentlyResolved` (owned `RESOLVED`/`CLOSED`, top 5). All dashboard lists order deterministically by `updatedAt DESC, id DESC`. Any cross-Requester entry is a contract violation. [Sheet]
- **BR-018** Staff metrics with explicit attribution (never an undifferentiated "My Work"): `ownedByMe` (non-terminal Tickets with `ticketOwnerId` = caller); `assignedToMe` (non-terminal Tickets holding ≥1 open `PLANNED`/`IN_PROGRESS` Action with `assignedToId` = caller — a Ticket count so the drill-down dataset matches exactly); `performedByMe` (Actions with `performedById` = caller, i.e. recorded by the caller, completed within the trailing 30×24h window); `unassigned` (non-terminal ownerless Tickets); `urgentHighPriority` (visible non-terminal Tickets with IT Priority `HIGH` or `CRITICAL`, listed separately from recent updates); `byStatus`/`byItPriority` aggregates; `recentlyUpdated` (top 8). The 30-day window is measured from the `COMPLETED` event time against a single request-time now-capture (UTC), lower bound inclusive. Exact predicate: `completedEvent.occurredAt >= now - INTERVAL '30 days' AND completedEvent.occurredAt <= now`, where `now` is the single server-side UTC timestamp captured once at request start and used for every row in that response. The `now` source MUST be the application server capture, never a per-row DB `now()`; client timezone MUST NOT affect membership. List ordering is deterministic: `updatedAt DESC, id DESC`; urgent lists rank `CRITICAL` above `HIGH`, then recency, then id. [Sheet examples + D §11.16]
- **BR-019** Administrators receive the Staff dashboard plus `userCounts { total, active, byRole }`. [Sheet option, ORD-03]
- **BR-020** `userCounts` shape and semantics: source of truth is the `User` table at request time; every row included; `active` = `isActive` true; `byRole` per stored role; deactivated derived as `total − active` and MUST NOT be transmitted; no user objects, emails, hashes, or per-account detail. [D]
- **BR-021** `userCounts` is Administrator-only (Staff response omits the key; Requesters denied). Drill-down is role-dimension only via `/admin/users?role=<ROLE>`; status drill-down MUST NOT exist. [D]
- **BR-022** Metrics are backend-calculated at request time; endpoints return aggregates plus drill-down references, never full collections. "Recent" is pure `updatedAt` ordering; timestamps UTC with Asia/Bangkok display. [Sheet]

### 5.9 Concurrency, Integrity, Idempotency, Seed
- **BR-023** Every Action mutation MUST carry `expectedVersion` against the integer version token (§7.2). Mismatch MUST yield `409 ACTION_STATE_CHANGED`. [D — replaces timestamp token]
- **BR-024** Eligibility revalidation at commit (assign/complete vs Admin deactivate/demote race): loser gets a safe `409` (`ACTION_ASSIGNEE_NOT_ELIGIBLE` / `USER_HAS_ACTIVE_ACTIONS`); invalid final states MUST NEVER commit. Tests MUST use real overlapping operations. [Sheet §6.1] The blocking predicate for `USER_HAS_ACTIVE_ACTIONS` is: `EXISTS (ActionTaken WHERE assignedToId = :user AND status IN (PLANNED, IN_PROGRESS) AND parent Ticket.currentStatus NOT IN (CLOSED, CANCELLED))`. `COMPLETED`/`CANCELLED` Actions never block; assignee-only (performer history does not block); evaluated under row locks in the same transaction as the deactivate/demote commit, symmetrically with the assign/complete eligibility revalidation.
- **BR-025** `clientRequestId` is REQUIRED on creation: requests without it are rejected with `400`. A retry with the same key on the same Ticket and an identical normalized intent (all compared after trimming; `actionDate` as UTC instants; description byte-exact after trim, case-sensitive) MUST NOT create, modify, or append any row or event, and MUST return HTTP `200` with the original Action body plus header `Idempotent-Replayed: true`. The same key with a different normalized intent MUST fail with `409 IDEMPOTENCY_CONFLICT` leaving the original byte-identical. Per-Ticket uniqueness is enforced at the database level. [Sheet §8.5]
- **BR-026** Migration is additive and MUST preserve all Lab 1–3 data. [Sheet]
- **BR-027** Seed MUST stay idempotent and non-destructive (Lab 3 BR-75 semantics extended). [Sheet]
- **BR-028** Seed MUST cover all major statuses/priorities, assigned and unassigned ownership, Tickets with zero/one/multiple Actions Taken, and zero-metric fixtures. [Sheet]

## 6. UI Specification Summary
Screens: Requester dashboard, Staff dashboard (+Admin counts card), Ticket Queue (unchanged), Ticket Detail + Actions Taken area (list, create, view/edit, transition, complete/cancel, history), User Management (role-filter drill-down target). States everywhere applicable: loading, empty, validation error, API failure, forbidden, conflict (with next action), success, disabled, permission-restricted. The Actions UI MUST demonstrate the full flow Create → View → Edit → Status Transition → Complete/Cancel → View History. Responsive at 1440/900/375 with no horizontal scroll; keyboard operability with visible focus; non-color status cues. Full detail in [ui-spec.md](./ui-spec.md).

## 7. Data Changes
`Ticket 1 ─── N ActionTaken`; `ActionTaken 1 ─── N ActionTakenEvent`.

### 7.0 Ticket Resolution Cycle (F1 — persistent source of truth)
`Ticket.resolutionCycle`: integer, `NOT NULL`, default `1`. Semantic: the ordinal of the Ticket's current resolution attempt; every `ActionTaken.cycle` snapshots this value at creation. Migration MUST add the column with default `1` and backfill every existing Lab 1–3 Ticket to `1` deterministically (no per-row variance; verified by MIG-03). Reopen MUST read the current cycle and atomically increment it in the same transaction as the status change (`RESOLVED`/`CLOSED → REOPENED`), so concurrent reopens serialize and the cycle advances exactly once per committed reopen. The resolution gate MUST compare `ActionTaken.cycle == Ticket.resolutionCycle` read from the Ticket row — deriving the current cycle from child rows is FORBIDDEN. No index beyond the PK is required (cycle is always read via the Ticket row already locked by the gate/reopen transaction).

**Cycle-name mapping (normative).** `Ticket.resolutionCycle` = persistent column, sole source of truth. `ActionTaken.cycle` = immutable snapshot of `Ticket.resolutionCycle` at creation; MUST equal the Ticket's cycle at that instant and MUST NEVER be updated. `currentCycle` = API response field carrying the Ticket's present `resolutionCycle` (error detail in `RESOLUTION_REQUIRES_COMPLETED_ACTION`, reopen response). No other name (e.g. `currentCycle` as a column, `cycle` on Ticket) SHALL be introduced.

### 7.1 ActionTaken
`id` PK; `ticketId` FK → Ticket Restrict, indexed; `description` (trimmed 1–1,000); `result` nullable (0–2,000, required on complete); `performedById` FK → User, immutable; `assignedToId` nullable FK → User; `actionDate` with BR-007 bounds; `followUpRequired` bool default false; `followUpNote` nullable (1–500 iff required); `attachmentNotes` nullable (0–500); `status` enum `PLANNED/IN_PROGRESS/COMPLETED/CANCELLED` default `PLANNED`, indexed; `cycle` int (Ticket cycle at creation); `version` int default 1; `clientRequestId` required UUID, unique per Ticket; `createdAt/updatedAt` UTC.

### 7.2 ActionTakenEvent
`id` PK; `actionTakenId` FK → ActionTaken Cascade (events die with their Action; Actions never delete Tickets), indexed; `eventType` enum `CREATED/UPDATED/ASSIGNED/STATUS_CHANGED/COMPLETED/CANCELLED/FOLLOW_UP_CHANGED`; `actorId` FK → User; `occurredAt` server timestamp; `payload` minimal before/after JSON; `requestId` correlation string. INSERT-only by application contract.

### 7.3 Version Token and Lock Hierarchy
Optimistic concurrency uses integer `version` (`UPDATE … WHERE id AND version = expected`, then `version + 1`; no row → `409`). Rationale: immune to clock precision/skew, deterministic race tests. Multi-entity transactions MUST acquire locks in the deterministic order `User → Ticket → ActionTaken → ActionTakenEvent` to prevent deadlocks and keep race tests predictable. Reopen MUST additionally serialize on the Ticket row: lock the Ticket row (`SELECT … FOR UPDATE` or equivalent row-lock in the transaction), read `resolutionCycle`, then execute the status change and `resolutionCycle = read + 1` as a conditional write `WHERE id AND currentStatus = expected AND resolutionCycle = read`; zero affected rows → `409 TICKET_STATE_CHANGED`. The counter MUST advance exactly once per committed reopen; a rolled-back transaction MUST NOT consume a cycle number.

### 7.4 Idempotency
`clientRequestId` (required client UUID) scoped unique per Ticket (`UNIQUE(ticketId, clientRequestId)`); duplicate submission with identical intent returns the original record; different intent under the same key fails closed; the check and insert share one transaction; distinct requests validate independently.

### 7.5 Database Design Decisions (≥2, Sheet §5.1)
1. **Current state vs immutable history.** `ActionTaken` holds mutable current state for workflow; `ActionTakenEvent` holds the audit trail. Rationale: editability (Sheet §8.3) and append-only auditability (Rubric Part 7) cannot live in one row without contradiction; separation resolves it.
2. **Integer version token over timestamp.** Rationale: deterministic conflict detection independent of clock precision/skew; race tests assert exact version increments.

### 7.6 Migration Recovery
Lab 4 migration is forward-only additive: no `DOWN` migration drops Lab 4 tables once deployed past staging. Recovery from a failed migration is restore-from-backup of the pre-migration snapshot plus re-run of the additive migration; the procedure MUST be documented in the release runbook. MIG-04 proves recovery on a Lab 3 snapshot: (1) snapshot, (2) apply Lab 4 migration, (3) restore to snapshot via the documented procedure, (4) re-apply cleanly, (5) Lab 1–3 data intact and `resolutionCycle = 1` holds. Test-database destructive operations are covered by the `TEST_DATABASE_URL` fail-closed guard; recovery MUST NEVER target the development database.

## 8. API Contract Summary
Endpoints (full shapes in [api-spec.md](./api-spec.md)): Create Action `POST /api/staff/tickets/:id/actions`; Get Actions `GET /api/tickets/:id/actions`; Update Action `PUT /api/staff/actions/:id`; Transition (start) via status field on update; Complete/Cancel `POST /api/staff/actions/:id/complete|/cancel`; History `GET /api/staff/actions/:id/events` (Staff-side; Requester via owned-Ticket history path); Resolve/Reopen through the existing status endpoint with gate; Requester dashboard `GET /api/dashboard/requester`; Staff dashboard `GET /api/dashboard/staff`. Every endpoint specifies actor, authentication, authorization, DTOs, validation, errors, conflicts, concurrency, and idempotency. Error contract uses only codes the system returns: `400` validation (incl. `ACTION_DATE_OUT_OF_RANGE`), `401` unauthenticated, `403` forbidden (incl. `PASSWORD_CHANGE_REQUIRED` for password-gated accounts per Lab 3), `404` missing-or-hidden (incl. `ACTION_NOT_FOUND`), `409` conflicts (`INVALID_ACTION_TRANSITION`, `ACTION_STATE_CHANGED`, `ACTION_ASSIGNEE_NOT_ELIGIBLE`, `USER_HAS_ACTIVE_ACTIONS`, `RESOLUTION_BLOCKED_BY_OPEN_ACTIONS`, `RESOLUTION_REQUIRES_COMPLETED_ACTION`, plus incomplete-cycle detail), `500` safe failure. No `422` is specified: the codebase convention (Lab 3 BR-64) expresses contract violations as `400`, and no requirement needs a separate semantic.

## 9. Acceptance Criteria

| AC | Given | When | Then | FR | BR | Test | Rubric |
|---|---|---|---|---|---|---|---|
| AC-001 | Authorized Staff, valid data | Create Action | Stored under correct Ticket with auth performer, `PLANNED`, version 1, `CREATED` event | FR-001 | BR-001/002/006–008 | API create | Part 6 |
| AC-002 | Any input class | Invalid/edge input incl. dates | Closed rejection, no partial write | FR-016, FR-020 | BR-005–007 | Validation/unit | Parts 6, 7 |
| AC-003 | `PLANNED`/`IN_PROGRESS` Action | Valid edit | Updated + version + event; terminal/stale rejected | FR-003 | BR-003, BR-023–024 | API/UI | Part 6 |
| AC-004 | `PLANNED` Action | Start | `IN_PROGRESS` + event; skip-to-complete rejected | FR-004 | BR-003 | API/UI | Part 6 |
| AC-005 | `IN_PROGRESS` Action | Complete with result | `COMPLETED` + event; result-less/ineligible rejected | FR-005 | BR-003/004 | API/UI | Part 6 |
| AC-006 | Open Action | Cancel | `CANCELLED` + event; terminal immutable after | FR-006 | BR-003 | API/UI | Part 6 |
| AC-007 | Any Action with history | Read history; attempt mutation path | Ordered immutable stream; no update/delete path exists | FR-008 | BR-010 | API/security | Parts 6, 7 |
| AC-008 | Eligible/ineligible users | Assign; race with deactivation | Eligible recorded + event; races resolve to safe `409` | FR-007 | BR-002, BR-024 | Concurrency | Part 6 |
| AC-009 | Requester on owned/unowned | View or mutate attempts | Full view on owned; `403`/`404` elsewhere | FR-002, FR-009 | BR-008 | Authz | Parts 6, 8 |
| AC-010 | Ticket with non-terminal Actions | Resolve incl. UI bypass | `409` with blocker detail; nothing mutates | FR-010 | BR-011/012 | Gate API | Part 7 |
| AC-011 | Completed cycle, no open Actions | Resolve | `RESOLVED` per matrix | FR-010 | BR-011/012 | Gate API | Part 7 |
| AC-012 | Legacy zero-action Ticket | Resolve | Rejected until ≥1 current-cycle completion (D) | FR-010 | BR-014 | Gate API | Part 7 |
| AC-013 | `RESOLVED`/`CLOSED` Ticket | Reopen | `REOPENED`, cycle+1, history kept, gate re-armed | FR-011 | BR-015/016 | Workflow | Part 7 |
| AC-014 | Authenticated Requester | Fetch dashboard | Owned-only metrics/lists; zeros safe | FR-012, FR-015 | BR-017, BR-022 | Dashboard API/UI | Part 8 |
| AC-015 | Staff/Admin | Fetch dashboard | Attribution-correct metrics; urgent separated; drill-down | FR-013, FR-015 | BR-018, BR-022 | Dashboard API/UI | Part 5 |
| AC-016 | Admin/Staff/Requester | Fetch counts | Admin sees exact shape; Staff key omitted; Requester denied | FR-014 | BR-019–021 | Isolation tests | Part 5 |
| AC-017 | Concurrent writers | Overlapping mutations | One winner; loser `409`; version increments exact | FR-017 | BR-023/024 | Concurrency | Parts 3, 7 |
| AC-018 | Retry with same key, same vs different intent; missing key | Identical replay returns original; different intent → `409 IDEMPOTENCY_CONFLICT`; missing key → `400` | FR-017 | BR-025 | Idempotency | Parts 3, 6 |
| AC-019 | Lab 3 snapshot | Migrate + seed (+rerun) | Data preserved; distribution correct; mutations kept | FR-018 | BR-026–028 | Migration | Parts 2, 3 |
| AC-020 | Full suite | Lab 1–3 behaviors | Green incl. contract-first status updates | FR-019 | [Lab3] | Regression | Part 8 |

### 9.1 AC Coverage
Happy path (AC-001, AC-004–AC-006, AC-011, AC-013–AC-015); validation (AC-002); authorization (AC-008, AC-009, AC-016); state conflict (AC-003, AC-010, AC-012, AC-013); concurrency (AC-017); idempotency (AC-018); migration continuity (AC-019); dashboards + regression (AC-014–AC-016, AC-020).

### 9.2 Rubric Traceability
| Requirement | FR | BR | AC | Test | Evidence | Answer Part |
|---|---|---|---|---|---|---|
| Git workflow | — | — | — | CI/PR records | Part 1 evidence | Part 1 |
| Engineering contract | FR-001–020 | BR-001–028 | AC-001–020 | Peer review | Merged docs | Part 2 |
| Test plan + results | — | — | AC-001–020 | Full suite | Test outputs | Part 3 |
| AI use | — | — | — | Prompt log | ai-use.md | Part 4 |
| Staff dashboard | FR-013–015 | BR-018–022 | AC-015/016 | Dashboard tests | UI + DB match | Part 5 |
| Actions Taken UI | FR-001–009, FR-020 | BR-001–010, BR-023–025 | AC-001–009, AC-017/018 | Action tests | UI + API | Part 6 |
| Ticket workflow | FR-010/011/017 | BR-011–016, BR-023/024 | AC-010–013, AC-017 | Workflow tests | API + history | Part 7 |
| Requester + regression | FR-002/009/012/015/019 | BR-008/017/022 | AC-009/014/020 | Dashboard + regression | UI + suite | Part 8 |
| Polish | FR-006 UI states | — | UI states | Visual/a11y | Screenshots | Part 9 |

## 10. Product Definition of Done
### 10.1 Requirement Completeness
- [ ] Every Handout requirement mapped to an FR; every FR has an AC; every BR has AC or test evidence; Parts 1–9 traceable; no unresolved ambiguity.
### 10.2 Functional
- [ ] Happy paths, validation, state transitions, error paths, resolution gate, and reopen behavior pass.
### 10.3 Action Taken
- [ ] Lifecycle transitions demonstrable; Create/View/Edit per permission; completion requires result; performer from authenticated user; follow-up correct; history append-only with no application update/delete path.
### 10.4 Security
- [ ] Authentication, server-side authorization, ownership, role boundaries enforced and tested; no privilege escalation; identity fields unspoofable.
### 10.5 Concurrency
- [ ] Integer version token enforced; stale writes conflict; concurrent transitions tested; transaction boundaries and lock ordering documented; deadlock-sensitive flows tested where applicable.
### 10.6 Idempotency
- [ ] Duplicate requests cannot duplicate Actions; key uniqueness enforced; retry tested.
### 10.7 Dashboard
- [ ] Required metrics complete; current-user attribution correct; urgent work separated from recent updates; drill-down scoped correctly; Requester strictly owned; Admin metrics expose no unnecessary PII.
### 10.8 Database
- [ ] Migration succeeds; existing data valid; constraints, indexes, FK behavior correct; seed deterministic; no unsafe unscoped test cleanup.
### 10.9 API
- [ ] DTOs, validation, authorization, error contract documented; `409` behaviors tested.
### 10.10 UI/UX
- [ ] Loading, empty, error, conflict, responsive, accessibility states; full Action lifecycle demonstrable on screen.
### 10.11 Testing
- [ ] Unit, integration, API, E2E (where required), concurrency, regression, and migration verification pass.
### 10.12 Evidence
- [ ] Every claim traces Requirement → Test → Command → Result → Evidence → Rubric Part, with outputs, CI, screenshots, API/UI/migration/concurrency/review evidence as the Handout requires.

## 11. Assumptions and Decisions
1. Four-state lifecycle with a cancel branch (D): the sheet names fields while Part 6 demands a demonstrable status transition — happy path `PLANNED → IN_PROGRESS → COMPLETED` plus the `CANCELLED` branch; a trivial two-state model cannot satisfy it.
2. Nullable assignee with performer fallback (D): required by "approved assignee" without mandating assignment.
3. Attachment notes are free text, not an Attachment FK: an FK would contradict the Lab 3 Staff-upload ban.
4. Two dashboard routes (ORD-01).
5. Result required only at completion, allowing incremental recording.
6. Integer version token + `User → Ticket → ActionTaken → ActionTakenEvent` lock order (D): determinism over clock-based tokens.
7. Admin userCounts included (ORD-03; sheet §4.6 permits).
8. No calendar-day metrics; Lab 3 UTC/Asia-Bangkok convention retained.
9. `clientRequestId` per-Ticket UUID scope for duplicate-submit safety only.
10. Lab 3 BR-45 extended to open assigned Actions.
11. Honest work-date rule with Jira/ServiceNow prototype evidence (researched).
12. User-counts detail shape and rejections (status drill-down, single-query mandate) as previously recorded.
13. BR sequential numbering by section (editorial).
14. **Cycle gate with legacy consequence (D):** BR-011/BR-014/BR-015 implement per-cycle resolution tracking even though the sheet text only states the incomplete-work rule. Rationale: without cycle scoping, reopen cannot re-arm the gate (Part 7 requires demonstrable resolve→reopen→resolve); without the ≥1-completion requirement, an empty Ticket resolves on zero evidence. Known deviation: legacy zero-action Tickets MUST earn one completion first — accepted because untracked work MUST NOT count as resolution evidence.
15. **No `422`:** the codebase convention expresses contract violations as `400`; nothing requires a separate semantic.
16. **Urgent = `HIGH`/`CRITICAL` IT Priority** (D): the sheet says "urgent" without defining it; these are the top two of the implemented four-level scale.
17. **PR #76 review-fix round (D, reviewer-driven):** `performedBy` = recorder/creator (immutable; completer recorded as event actor, assignee presence does not restrict who completes); `clientRequestId` required with `409 IDEMPOTENCY_CONFLICT` on divergent intent; exact complete/cancel bodies; unknown-enum → `400` vs forbidden-transition → `409`; password-gate → `403` per Lab 3; queue `assignee` filter + CSV `itPriority` added solely to make drill-down datasets reproducible; `performedByMe` intentionally without drill-down; 30×24h completion-event window with inclusive bound; deterministic tie-breakers everywhere; append-only guaranteed at application level (DB triggers out of scope); one event per changed aspect in fixed order; four-state (not three-state) lifecycle wording. `Ticket.resolutionCycle` persistence added as BR-029 with deterministic backfill.

## 12. Rubric Traceability — Answer Part 1–9
| Answer Part | Requirement Coverage | FR | BR | AC | Test/Evidence | UI Evidence | Status |
|---|---|---|---|---|---|---|---|
| Part 1 Git workflow | Branches→staging→main; Kanban Done; reviewer record | — | — | — | CI/PR records | — | Specified |
| Part 2 Spec DD | This contract: FR/BR/matrix/decisions/DoD | FR-001–020 | BR-001–028 | AC-001–020 | Peer review | — | Specified |
| Part 3 Test DD | tests.md plan + traceability + results | — | — | AC-001–020 | Full suite outputs | — | Specified |
| Part 4 AI use | LLM + prompts + reflection | — | — | — | ai-use.md | — | Specified |
| Part 5 Staff dashboard | Metrics + attribution + urgent + counts | FR-013–015 | BR-018–022 | AC-015/016 | Dashboard tests | Screenshots | Specified |
| Part 6 Actions Taken | List/create/assign/edit/transition/complete/cancel/history | FR-001–009, FR-016/017/020 | BR-001–010, BR-023–025 | AC-001–009, AC-017/018 | Action tests | Screenshots | Specified |
| Part 7 Ticket workflow | Transitions, gate, cycles, reopen, history | FR-010/011/017 | BR-011–016, BR-023/024 | AC-010–013, AC-017 | Workflow tests | Screenshots | Specified |
| Part 8 Requester + regression | Owned metrics, drill-down, Lab 1–3 green | FR-002/009/012/015/019 | BR-008/017/022 | AC-009/014/020 | Dashboard + regression | Screenshots | Specified |
| Part 9 Polish | Responsive, a11y, visual consistency | — | — | UI states | Visual/a11y checks | Screenshots | Specified |
