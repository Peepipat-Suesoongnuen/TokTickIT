# Lab 4 REST API Specification — TokTickIT Actions Taken, Workflow Gate, and Dashboards

Companion to [specification.md](./specification.md). Lab 3 conventions apply unchanged: error envelope `{ "error": { "code", "message" } }` with optional Lab 2-compatible top-level `fieldErrors`; strict contracts (unknown or duplicate query parameters, invalid enum or type values, unknown JSON body fields → `400`); ISO 8601 UTC timestamps; server-side opaque sessions with 8-hour absolute expiry; exact-Origin enforcement on every state-changing request including Login; credentialed CORS allow-list; `mustChangePassword` gate. Common HTTP semantics follow Lab 3 BR-64. Only status codes the NEW Lab 4 endpoints return are specified here (`200/201/400/401/403/404/409/500`); inherited Lab 3 codes on existing endpoints (e.g. attachment `413`/`415`, rate-limit `429`) continue per the Lab 3 contract. No `422` exists in this codebase convention.

> Status: NORMATIVE CONTRACT synchronized to specification.md (FR-001–FR-020, BR-001–BR-029).

## 1. Error Codes (Lab 4)

| Code | HTTP | Meaning |
|---|---|---|
| `ACTION_NOT_FOUND` | 404 | No such action, or not visible to the caller (ownership-hidden like protected Lab 3 Tickets) |
| `INVALID_ACTION_TRANSITION` | 409 | Valid state with a forbidden transition, or mutation on a non-actionable Ticket (BR-009) |
| `ACTION_STATE_CHANGED` | 409 | `expectedVersion` mismatch — the client MUST refresh and retry |
| `ACTION_ASSIGNEE_NOT_ELIGIBLE` | 409 | Assignee or accountable person inactive or not Staff-side at commit |
| `USER_HAS_ACTIVE_ACTIONS` | 409 | Admin deactivate/demote races an open assigned Action (predicate: BR-024 — open action on a non-terminal Ticket; extends Lab 3 BR-45) |
| `RESOLUTION_BLOCKED_BY_OPEN_ACTIONS` | 409 | Resolve attempted while non-terminal Actions remain; response includes `openActionIds` |
| `RESOLUTION_REQUIRES_COMPLETED_ACTION` | 409 | Resolve attempted with zero `COMPLETED` Actions in the current cycle; response includes `currentCycle` |
| `IDEMPOTENCY_CONFLICT` | 409 | Same `clientRequestId` on the same Ticket with a different normalized create intent |
| `ACTION_DATE_OUT_OF_RANGE` | 400 | `actionDate` outside `[ticket.ticketDate, now + 1h]` (BR-007) |

## 2. Actions Taken

Shared Action shape: `{ id, ticketId, description, result, performedBy: { id, name }, assignedTo: { id, name } | null, actionDate, followUpRequired, followUpNote, attachmentNotes, status, cycle, version, createdAt, updatedAt }`. `status` is one of `PLANNED, IN_PROGRESS, COMPLETED, CANCELLED` — the word `OPEN` MUST NEVER appear as an Action status (it remains a Ticket status only). List ordering is stable: `actionDate ASC, id ASC`.

### LAP4-01 List actions — `GET /api/tickets/:id/actions`

- Requirement linkage: FR-002, FR-009; BR-008; AC-009.
- Authentication: session required. Authorization: a Requester receives only an owned Ticket (otherwise safe `404`); IT Staff/Administrator require authorized Ticket visibility (otherwise `403`/`404` per Lab 3 hiding rules).
- Query parameters: none. Success: `200 { actions: [...], meta: { count } }`.
- Errors: `401` unauthenticated; `403` forbidden incl. `PASSWORD_CHANGE_REQUIRED` for password-gated accounts (Lab 3 baseline: missing auth → `401`, gate → `403`); `404` per above; `500` safe failure.

### LAP4-02 Create action — `POST /api/staff/tickets/:id/actions`

- Requirement linkage: FR-001, FR-003, FR-011, FR-017, FR-020; BR-001–BR-002, BR-004–BR-007, BR-025; AC-001, AC-002, AC-018.
- Authentication: session required. Authorization: `IT_STAFF`/`ADMINISTRATOR` on an accessible non-terminal Ticket; Requester → `403`. State-changing → exact-Origin enforced.
- Path parameters: `id` — positive integer Ticket id; unknown id → `404`.
- Headers: `Origin` MUST exactly match a configured approved origin.
- Request body (all server-revalidated):
  - `description`: required string, trimmed 1–1,000.
  - `result`: optional string, 0–2,000 (required only at completion).
  - `assignedToId`: optional positive integer; when present MUST reference an active `IT_STAFF`/`ADMINISTRATOR`, else `409 ACTION_ASSIGNEE_NOT_ELIGIBLE`.
  - `actionDate`: optional ISO 8601 datetime, defaults to now; MUST satisfy BR-007 bounds, else `400 ACTION_DATE_OUT_OF_RANGE`.
  - `followUpRequired`: optional boolean, default false. `followUpNote`: required (trimmed 1–500) if and only if `followUpRequired` is true.
  - `attachmentNotes`: optional string, 0–500.
  - `clientRequestId`: required UUID, unique per Ticket (BR-025). Requests without it → `400`.
  - `status`, `performedById`, `version`, `cycle`, `createdAt` MUST NOT be supplied (unknown fields → `400`).
- Behavior: the performer is the authenticated user; initial status is `PLANNED`; `version` starts at 1; `cycle` equals the Ticket's current cycle. A `CREATED` event is appended in the same transaction. A retry with the same `clientRequestId` on the same Ticket and an identical normalized intent (description, `assignedToId`, `actionDate`, follow-up pair, `attachmentNotes`, `result` — all compared after trimming; `actionDate` compared as UTC instants so equivalent offsets match; description compared byte-exact after trim, case-sensitive) MUST NOT create, modify, or append any row or event, and MUST return HTTP `200` with the original Action body plus header `Idempotent-Replayed: true`. Same key with a different normalized intent → `409 IDEMPOTENCY_CONFLICT` with the canonical error envelope; the original row and its events MUST remain byte-identical. Concurrent inserts with the same key MUST rely on the database unique constraint as arbiter: on unique violation the handler MUST re-read the winner and apply the identical-vs-different rule deterministically (replay `200` or `409`), so exactly one logical Action results. Creation on a `RESOLVED`/`CLOSED`/`CANCELLED` Ticket → `409 INVALID_ACTION_TRANSITION` (BR-009).
- Success: `201` with the Action shape. Errors: `400` (+ `fieldErrors`), `401`, `403`, `404`, `409` per above, `500`.

### LAP4-03 Update action — `PUT /api/staff/actions/:id`

- Requirement linkage: FR-003, FR-004, FR-007, FR-017; BR-003–BR-007, BR-023–BR-024; AC-003, AC-004, AC-008, AC-017.
- Authorization: `IT_STAFF`/`ADMINISTRATOR` with visibility of the parent Ticket; strictly non-terminal Ticket only (`NEW`/`OPEN`/`IN_PROGRESS`/`WAITING_FOR_REQUESTER`/`REOPENED` — `RESOLVED` is non-actionable per BR-009); exact-Origin enforced.
- Editable fields while `PLANNED` or `IN_PROGRESS`: `description`, `result`, `assignedToId`, `actionDate`, `followUpRequired`, `followUpNote`, `attachmentNotes`, plus:
  - `status`: optional transition — `PLANNED → IN_PROGRESS` only. A syntactically valid, known status value that is not permitted from the current state (including skip to `COMPLETED` or any move out of a terminal state) → `409 INVALID_ACTION_TRANSITION`. A value outside the `PLANNED, IN_PROGRESS, COMPLETED, CANCELLED` enum is malformed input → `400` with `fieldErrors` per the strict contract (§6), never `409`. Completion and cancellation use LAP4-04 exclusively.
  - `expectedVersion`: required integer, MUST equal current `version`, else `409 ACTION_STATE_CHANGED`.
- Each successful update increments `version` by exactly 1 and appends exactly one event per changed aspect in the fixed BR-010 order (`STATUS_CHANGED`, `ASSIGNED`, `FOLLOW_UP_CHANGED`, `UPDATED`), sharing one request correlation id, in the same transaction.
- Errors: `400` validation; `401`; `403`/`404` hiding; `409` per above; `500`.
- Success: `200` with the updated Action shape.

### LAP4-04 Complete / cancel — `POST /api/staff/actions/:id/complete`, `POST /api/staff/actions/:id/cancel`

- Requirement linkage: FR-005, FR-006, FR-017; BR-003–BR-004, BR-023–BR-024; AC-005, AC-006, AC-017.
- Authorization: as LAP4-03; exact-Origin enforced.
- Complete requires status `IN_PROGRESS`, a non-empty `result` (body or stored), and an accountable person — assignee when set, otherwise performer — revalidated as eligible at commit. The completer MAY be any authorized Staff-side user (assignee presence does NOT restrict who completes); the completer is recorded as the `COMPLETED` event actor and `performedById` MUST NOT change. Cancel accepts `PLANNED` or `IN_PROGRESS` and requires no result. Both require `expectedVersion`, increment `version`, append `COMPLETED`/`CANCELLED` events, and are terminal afterwards.
- Exact request bodies:
  - Complete: `{ "expectedVersion": 3, "result": "…", "followUpRequired": false, "followUpNote": "…" }` — `expectedVersion` required; `result` optional when a stored result already exists (required otherwise); `followUpRequired`/`followUpNote` optional and validated by the same rules, so follow-up MAY be set alongside completion. An empty body `{}` → `400` (missing `expectedVersion`). Unknown fields → `400`.
  - Cancel: `{ "expectedVersion": 3 }` — `expectedVersion` required and only it is accepted besides nothing; any other field → `400`.
- Race with Admin deactivate/demote of the accountable person: at least one side receives a safe `409` (BR-024); an ineligible final state MUST NEVER commit.
- Success: `200` with the terminal Action shape.

### LAP4-08 Action history — `GET /api/staff/actions/:id/events`, `GET /api/tickets/:id/actions/:actionId/events`

- Requirement linkage: FR-008, FR-009; BR-010; AC-007.
- Authorization: staff path requires Ticket visibility; Requester path requires owned Ticket (otherwise safe `404`). No update or delete history route exists anywhere; their absence is covered by negative tests.
- Event shape: `{ id, actionTakenId, eventType, actor: { id, name }, occurredAt, payload, requestId }`, where `eventType` is one of `CREATED, UPDATED, ASSIGNED, STATUS_CHANGED, COMPLETED, CANCELLED, FOLLOW_UP_CHANGED` (specification BR-010). Ordering is deterministic: `occurredAt ASC, id ASC`. Success: `200 { events: [...], meta: { count } }` (no pagination: per-Action streams are small).

## 3. Ticket Resolution Gate and Reopen — existing status endpoint, extended (LAP4-05)

- Requirement linkage: FR-010, FR-011; BR-011–BR-016, BR-029; AC-010–AC-013.
- The existing status-transition endpoint keeps its path, shape, and Lab 3 semantics (including `expectedCurrentStatus` staleness protection). Resolution transitions additionally verify, atomically with the transition in one transaction (lock order `User → Ticket → ActionTaken → ActionTakenEvent`):
  1. ≥1 `COMPLETED` Action with `ActionTaken.cycle == Ticket.resolutionCycle` read from the Ticket row (never derived from child rows), else `409 RESOLUTION_REQUIRES_COMPLETED_ACTION` with `{ currentCycle }`;
  2. zero non-terminal Actions with `ActionTaken.cycle == Ticket.resolutionCycle`, else `409 RESOLUTION_BLOCKED_BY_OPEN_ACTIONS` with `{ openActionIds }`.
- Reopen (`RESOLVED`/`CLOSED → REOPENED`) reads `Ticket.resolutionCycle` under row lock and increments it in the same conditional transaction as the status change (`WHERE id AND currentStatus = expected AND resolutionCycle = read`; zero rows → `409 TICKET_STATE_CHANGED`), exactly once per committed reopen with no gaps from rolled-back transactions (specification §7.3); the success response includes the new `currentCycle`. Previous-cycle Actions keep their states as history and MUST NOT satisfy the new gate. Reopen atomically clears `requesterResolutionIndicatedAt`. No reason text is required.
- Zero-action Tickets (including legacy) fail check (1) and MUST complete an Action first. Existing Lab 3 status tests that resolve such Tickets MUST be updated contract-first (tracked in tests.md).

## 4. Dashboards

### LAP4-06 Requester — `GET /api/dashboard/requester`

- Requirement linkage: FR-012, FR-015; BR-017, BR-022; AC-014.
- Authorization: `REQUESTER` only; Staff/Admin → `403`. Every number and list entry strictly owned-scope.
- Success `200`:
```json
{
  "metrics": { "openTickets": 0, "waitingForRequester": 0 },
  "recentlyUpdated": [ { "id", "ticketNumber", "summary", "currentStatus", "updatedAt" } ],
  "recentlyResolved": [ { "id", "ticketNumber", "summary", "currentStatus", "updatedAt" } ],
  "links": { "openTickets": "/my-tickets?state=open", "waitingForRequester": "/my-tickets?status=WAITING_FOR_REQUESTER", "recentlyResolved": "/my-tickets?state=resolved" }
}
```
- `recentlyUpdated`: owned, top 5 ordered `updatedAt DESC, id DESC`. `recentlyResolved`: owned `RESOLVED`/`CLOSED`, top 5 ordered `updatedAt DESC, id DESC`. Empty → `[]` with zero metrics, never `404`.
- Drill-down contract: `MyTickets` MUST initialize filters from `?status=` (any of the eight Ticket statuses) and `?state=open|resolved` (open = five non-terminal states; resolved = `RESOLVED`/`CLOSED`); unknown values are ignored with filters at default.

### LAP4-07 IT Staff — `GET /api/dashboard/staff`

- Requirement linkage: FR-013–FR-015; BR-018–BR-022; AC-015, AC-016.
- Authorization: `IT_STAFF`/`ADMINISTRATOR`; Requester → `403`.
- Success `200`:
```json
{
  "metrics": { "ownedByMe": 0, "assignedToMe": 0, "performedByMe": 0, "unassigned": 0, "urgentHighPriority": 0, "byStatus": {}, "byItPriority": {} },
  "recentlyUpdated": [ { "id", "ticketNumber", "summary", "currentStatus", "owner": { "id", "name" } | null, "updatedAt" } ],
  "urgentTickets": [ { "id", "ticketNumber", "summary", "itPriority", "currentStatus", "updatedAt" } ],
  "userCounts": { "total": 0, "active": 0, "byRole": { "REQUESTER": 0, "IT_STAFF": 0, "ADMINISTRATOR": 0 } },
  "links": { "ownedByMe": "/staff/queue?owner=me", "assignedToMe": "/staff/queue?assignee=me", "unassigned": "/staff/queue?owner=unassigned", "urgentHighPriority": "/staff/queue?itPriority=HIGH,CRITICAL", "usersByRole": "/admin/users?role=IT_STAFF" }
}
```
- Attribution (never merged): `ownedByMe` counts non-terminal Tickets with `ticketOwnerId` = caller; `assignedToMe` counts non-terminal Tickets holding ≥1 open (`PLANNED`/`IN_PROGRESS`) Action with `assignedToId` = caller; `performedByMe` counts Actions with `performedById` = caller (recorded by the caller) completed within the trailing 30×24h window measured from each `COMPLETED` event time against a single request-time now-capture (UTC, lower bound inclusive). Exact predicate: `completedEvent.occurredAt >= now - INTERVAL '30 days' AND completedEvent.occurredAt <= now` with server-captured `now`; completions timestamped after the capture (clock skew) are excluded. `urgentHighPriority` counts visible non-terminal Tickets with IT Priority `HIGH` or `CRITICAL`; `urgentTickets` lists them (top 10 ordered priority-rank `CRITICAL` > `HIGH`, then `updatedAt DESC, id DESC`), kept separate from `recentlyUpdated` (top 8 ordered `updatedAt DESC, id DESC`). `performedByMe` intentionally has NO drill-down link: the queue vocabulary has no performer dimension, and the metric is a recent-work summary — its card MUST render non-clickable.
- `userCounts` (BR-019–BR-021): `ADMINISTRATOR` only; the Staff response MUST omit the key entirely; no user objects, emails, or per-account fields. Role drill-down uses implemented filter values; status-based user links MUST NOT exist.
- `StaffQueue` MUST initialize `owner` from `?owner=unassigned|me`, `assignee` from `?assignee=me|<positive user id>` (tickets holding ≥1 open Action assigned to that user — server-computed so the dataset reproduces `assignedToMe` exactly), `itPriority` from `?itPriority=<level>` or comma-separated levels (each strictly validated; single value behavior unchanged), and `sort`/`order` (all within the implemented filter/sort vocabulary); unknown values are ignored.
- Errors: `401`, `403`, `500`.

## 5. Concurrency Summary

Action mutations use integer `expectedVersion` → `409 ACTION_STATE_CHANGED` with exact `version + 1` increments. Ticket mutations keep the Lab 3 expected-value pattern (`expectedOwnerId`, `expectedItPriority`, `expectedCurrentStatus` → `409 TICKET_STATE_CHANGED`); no Ticket version field is introduced (specification scope). Cross-feature races (action assign/complete vs Admin deactivate/demote; resolve vs concurrent action completion) follow the shared Lab 3 BR-76-style protocol: serialize or revalidate at commit with deterministic lock order `User → Ticket → ActionTaken → ActionTakenEvent`; the loser receives a safe `409`; invalid final states never commit. Concurrency tests MUST use real overlapping database operations.

## 6. Validation Summary

| Field | Rule | Failure |
|---|---|---|
| `description` | trimmed 1–1,000 | `400` + `fieldErrors` |
| `result` | 0–2,000; non-empty required on complete | `400` / `409 INVALID_ACTION_TRANSITION` |
| `followUpNote` | required (trimmed 1–500) iff `followUpRequired` | `400` + `fieldErrors` |
| `attachmentNotes` | 0–500 | `400` + `fieldErrors` |
| `actionDate` | ISO datetime within `[ticket.ticketDate, now + 1h]` | `400 ACTION_DATE_OUT_OF_RANGE` |
| `assignedToId` | existing active Staff-side user | `409 ACTION_ASSIGNEE_NOT_ELIGIBLE` |
| `clientRequestId` | required UUID, unique per Ticket | `400` when missing; identical-intent replay returns `200` + `Idempotent-Replayed` with zero new rows/events; different intent → `409 IDEMPOTENCY_CONFLICT` |
| `expectedVersion` | MUST equal current `version` | `409 ACTION_STATE_CHANGED` |
| `status` (update) | only `PLANNED → IN_PROGRESS` | `409 INVALID_ACTION_TRANSITION` |
| Unknown body fields / params / enums | strict contract | `400` |

## 7. Security Behavior (per-operation chain)

UI visibility → API authentication → server authorization → resource access: every endpoint re-derives identity, role, ownership, and workflow state from server state per request. Direct calls with forged `performedById`, cross-Requester ids, terminal-state mutations, or event-mutation attempts MUST fail closed. `404` hides unauthorized protected resources wherever Lab 3 does; responses expose only authorized UI fields.
