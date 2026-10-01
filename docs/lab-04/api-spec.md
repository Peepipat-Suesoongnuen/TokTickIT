# Lab 4 REST API Specification — TokTickIT Actions Taken, Workflow Gate, and Dashboards

Companion to [specification.md](./specification.md). Lab 3 conventions apply unchanged: error envelope `{ "error": { "code", "message" } }` with optional Lab 2-compatible top-level `fieldErrors`; strict contracts (unknown or duplicate query parameters, invalid enum or type values, unknown JSON body fields → `400`); ISO 8601 UTC timestamps; server-side opaque sessions with 8-hour absolute expiry; exact-Origin enforcement on every state-changing request including Login; credentialed CORS allow-list; `mustChangePassword` gate. Common HTTP semantics follow Lab 3 BR-64. Only status codes the system actually returns are specified (`200/201/400/401/403/404/409/500`). No `422` exists in this codebase convention.

> Status: NORMATIVE CONTRACT synchronized to specification.md (FR-001–FR-020, BR-001–BR-028).

## 1. Error Codes (Lab 4)

| Code | HTTP | Meaning |
|---|---|---|
| `ACTION_NOT_FOUND` | 404 | No such action, or not visible to the caller (ownership-hidden like protected Lab 3 Tickets) |
| `INVALID_ACTION_TRANSITION` | 409 | Lifecycle violation, unknown target state, or mutation on a terminal Ticket (BR-009) |
| `ACTION_STATE_CHANGED` | 409 | `expectedVersion` mismatch — the client MUST refresh and retry |
| `ACTION_ASSIGNEE_NOT_ELIGIBLE` | 409 | Assignee or accountable person inactive or not Staff-side at commit |
| `USER_HAS_ACTIVE_ACTIONS` | 409 | Admin deactivate/demote races an open assigned Action (extends Lab 3 BR-45) |
| `RESOLUTION_BLOCKED_BY_OPEN_ACTIONS` | 409 | Resolve attempted while non-terminal Actions remain; response includes `openActionIds` |
| `RESOLUTION_REQUIRES_COMPLETED_ACTION` | 409 | Resolve attempted with zero `COMPLETED` Actions in the current cycle; response includes `currentCycle` |
| `ACTION_DATE_OUT_OF_RANGE` | 400 | `actionDate` outside `[ticket.ticketDate, now + 1h]` (BR-007) |

## 2. Actions Taken

Shared Action shape: `{ id, ticketId, description, result, performedBy: { id, name }, assignedTo: { id, name } | null, actionDate, followUpRequired, followUpNote, attachmentNotes, status, cycle, version, createdAt, updatedAt }`. `status` is one of `PLANNED, IN_PROGRESS, COMPLETED, CANCELLED` — the word `OPEN` MUST NEVER appear as an Action status (it remains a Ticket status only). List ordering is stable: `actionDate ASC, id ASC`.

### LAP4-01 List actions — `GET /api/tickets/:id/actions`

- Requirement linkage: FR-002, FR-009; BR-008; AC-009.
- Authentication: session required. Authorization: a Requester receives only an owned Ticket (otherwise safe `404`); IT Staff/Administrator require authorized Ticket visibility (otherwise `403`/`404` per Lab 3 hiding rules).
- Query parameters: none. Success: `200 { actions: [...], meta: { count } }`.
- Errors: `401` unauthenticated or password-gate; `403`/`404` per above; `500` safe failure.

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
  - `clientRequestId`: optional UUID, unique per Ticket (BR-025).
  - `status`, `performedById`, `version`, `cycle`, `createdAt` MUST NOT be supplied (unknown fields → `400`).
- Behavior: the performer is the authenticated user; initial status is `PLANNED`; `version` starts at 1; `cycle` equals the Ticket's current cycle. A `CREATED` event is appended in the same transaction. A retry with the same `clientRequestId` on the same Ticket MUST return the original `201` record without duplicating. Creation on a `CLOSED`/`CANCELLED` Ticket → `409 INVALID_ACTION_TRANSITION` (BR-009).
- Success: `201` with the Action shape. Errors: `400` (+ `fieldErrors`), `401`, `403`, `404`, `409` per above, `500`.

### LAP4-03 Update action — `PUT /api/staff/actions/:id`

- Requirement linkage: FR-003, FR-004, FR-007, FR-017; BR-003–BR-007, BR-023–BR-024; AC-003, AC-004, AC-008, AC-017.
- Authorization: `IT_STAFF`/`ADMINISTRATOR` with visibility of the parent Ticket; non-terminal Ticket only (BR-009); exact-Origin enforced.
- Editable fields while `PLANNED` or `IN_PROGRESS`: `description`, `result`, `assignedToId`, `actionDate`, `followUpRequired`, `followUpNote`, `attachmentNotes`, plus:
  - `status`: optional transition — `PLANNED → IN_PROGRESS` only. Any other requested transition (including skip to `COMPLETED`, any move out of terminal, or unknown state) → `409 INVALID_ACTION_TRANSITION`. Completion and cancellation use LAP4-04 exclusively.
  - `expectedVersion`: required integer, MUST equal current `version`, else `409 ACTION_STATE_CHANGED`.
- Each successful update increments `version` by exactly 1 and appends one event (`UPDATED`, `ASSIGNED`, or `STATUS_CHANGED` as appropriate) in the same transaction.
- Errors: `400` validation; `401`; `403`/`404` hiding; `409` per above; `500`.
- Success: `200` with the updated Action shape.

### LAP4-04 Complete / cancel — `POST /api/staff/actions/:id/complete`, `POST /api/staff/actions/:id/cancel`

- Requirement linkage: FR-005, FR-006, FR-017; BR-003–BR-004, BR-023–BR-024; AC-005, AC-006, AC-017.
- Authorization: as LAP4-03; exact-Origin enforced.
- Complete requires status `IN_PROGRESS`, a non-empty `result` (body or stored), and an accountable person — assignee when set, otherwise performer — revalidated as eligible at commit. Cancel accepts `PLANNED` or `IN_PROGRESS` and requires no result. Both require `expectedVersion`, increment `version`, append `COMPLETED`/`CANCELLED` events, and are terminal afterwards.
- Race with Admin deactivate/demote of the accountable person: at least one side receives a safe `409` (BR-024); an ineligible final state MUST NEVER commit.
- Success: `200` with the terminal Action shape.

### LAP4-08 Action history — `GET /api/staff/actions/:id/events`, `GET /api/tickets/:id/actions/:actionId/events`

- Requirement linkage: FR-008, FR-009; BR-010; AC-007.
- Authorization: staff path requires Ticket visibility; Requester path requires owned Ticket (otherwise safe `404`). No update or delete history route exists anywhere; their absence is covered by negative tests.
- Event shape: `{ id, actionTakenId, eventType, actor: { id, name }, occurredAt, payload, requestId }`, where `eventType` is one of `CREATED, UPDATED, ASSIGNED, STATUS_CHANGED, COMPLETED, CANCELLED, FOLLOW_UP_CHANGED` (specification BR-010). Ordering is deterministic: `occurredAt ASC, id ASC`. Success: `200 { events: [...], meta: { count } }` (no pagination: per-Action streams are small).

## 3. Ticket Resolution Gate and Reopen — existing status endpoint, extended (LAP4-05)

- Requirement linkage: FR-010, FR-011; BR-011–BR-016; AC-010–AC-013.
- The existing status-transition endpoint keeps its path, shape, and Lab 3 semantics. Resolution transitions additionally verify, atomically with the transition in one transaction (lock order `User → Ticket → ActionTaken → ActionTakenEvent`):
  1. ≥1 `COMPLETED` Action in the Ticket's current cycle, else `409 RESOLUTION_REQUIRES_COMPLETED_ACTION` with `{ currentCycle }`;
  2. zero non-terminal Actions in the current cycle, else `409 RESOLUTION_BLOCKED_BY_OPEN_ACTIONS` with `{ openActionIds }`.
- Reopen (`RESOLVED`/`CLOSED → REOPENED`) increments the Ticket cycle; previous-cycle Actions keep their states as history and MUST NOT satisfy the new gate. No reason text is required.
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
- `recentlyUpdated`: owned, top 5 by `updatedAt` desc. `recentlyResolved`: owned `RESOLVED`/`CLOSED`, top 5. Empty → `[]` with zero metrics, never `404`.
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
  "links": { "ownedByMe": "/staff/queue?owner=me", "assignedToMe": "/staff/queue?owner=me", "unassigned": "/staff/queue?owner=unassigned", "urgentHighPriority": "/staff/queue?sort=itPriority&order=desc", "usersByRole": "/admin/users?role=IT_STAFF" }
}
```
- Attribution (never merged): `ownedByMe` counts non-terminal Tickets owned by the caller; `assignedToMe` counts open (`PLANNED`/`IN_PROGRESS`) Actions assigned to the caller; `performedByMe` counts Actions performed by the caller completed in the last 30 days. `urgentHighPriority` counts visible non-terminal Tickets with IT Priority `HIGH` or `CRITICAL`; `urgentTickets` lists them (top 10, priority then recency), kept separate from `recentlyUpdated` (top 8 by `updatedAt` desc).
- `userCounts` (BR-019–BR-021): `ADMINISTRATOR` only; the Staff response MUST omit the key entirely; no user objects, emails, or per-account fields. Role drill-down uses implemented filter values; status-based user links MUST NOT exist.
- `StaffQueue` MUST initialize `owner` from `?owner=unassigned|me`, `itPriority` from `?itPriority=<level>`, and `sort`/`order` from `?sort=itPriority&order=desc` (all within the implemented filter/sort vocabulary); unknown values are ignored. The urgent link intentionally sorts rather than filters so both `HIGH` and `CRITICAL` stay visible.
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
| `clientRequestId` | UUID, unique per Ticket | `400` / replay returns original `201` |
| `expectedVersion` | MUST equal current `version` | `409 ACTION_STATE_CHANGED` |
| `status` (update) | only `PLANNED → IN_PROGRESS` | `409 INVALID_ACTION_TRANSITION` |
| Unknown body fields / params / enums | strict contract | `400` |

## 7. Security Behavior (per-operation chain)

UI visibility → API authentication → server authorization → resource access: every endpoint re-derives identity, role, ownership, and workflow state from server state per request. Direct calls with forged `performedById`, cross-Requester ids, terminal-state mutations, or event-mutation attempts MUST fail closed. `404` hides unauthorized protected resources wherever Lab 3 does; responses expose only authorized UI fields.
