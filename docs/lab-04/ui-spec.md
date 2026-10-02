# Lab 4 UI Specification — TokTickIT Zen Green Continuity

Companion to [specification.md](./specification.md) and [api-spec.md](./api-spec.md). The Lab 2/3 visual language (Zen Green tokens, typography, badges, tables, cards, focus treatment, feedback patterns) is extended, never redesigned. Every behavior below is testable; screen description alone is not the contract. UI visibility is presentation only and MUST NEVER substitute for server authorization.

## 1. Design Continuity

All Lab 4 screens MUST reuse Lab 2/3 tokens, spacing, form states, table and card patterns, the bordered badge family (text always present, never color-only), the Staff Detail tab-switcher language, and safe feedback patterns. Dense Staff/Admin screens MAY widen to ~1360px; the Requester baseline stays ~1200px. Horizontal page scrolling MUST NOT occur.

## 2. Application Shell — Dashboard Navigation

- Two separate role-guarded routes: `/dashboard` (Requester) and `/staff-dashboard` (IT Staff/Administrator).
- The primary navigation MUST contain a `Dashboard` entry pointing at the caller's role route, with clear active-page indication. Unauthenticated callers MUST NOT see it. A Requester opening `/staff-dashboard` (or Staff opening `/dashboard`) MUST receive the safe forbidden page, never the other role's data.

## 3. Requester Dashboard (`/dashboard`)

- Metric cards — Open Tickets, Waiting for You, Recently Resolved: label, value, and drill-down action to the linked filtered My Tickets view.
- Lists — recently updated (5) and recently resolved (5): Ticket No., Summary, Status, Updated per row. Rows MUST be keyboard-operable and open the owned Ticket Detail.
- Loading: skeleton placeholders. Empty (zero Tickets): a guidance card pointing at Create Ticket — never a blank page. Forbidden: §2 rule. API failure: inline error with retry; entered state preserved where applicable.

## 4. IT Staff Dashboard (`/staff-dashboard`)

  - Metric cards — Owned by Me (`ownedByMe`), Assigned to Me (`assignedToMe`), Recorded by Me (`recordedByMe`, non-clickable by design — no recorder dimension exists in queue vocabulary), Unassigned (`unassigned`), Urgent High/Critical (`urgentHighPriority`), By Status (`byStatus`), By IT Priority (`byItPriority`): each card labels its attribution source explicitly (never a merged "My Work"). Drill-down: owned/unassigned/assignee cards to the matching Staff Queue filtered views (`?owner=…`, `?assignee=…`); the Urgent card to `/staff/queue?itPriority=HIGH,CRITICAL` (dataset-identical); per-priority cards to their single value.
- Lists kept separate: urgent tickets (`HIGH`/`CRITICAL`, top 10) and recently updated (top 8). Rows open Ticket Detail.
- Administrators see the identical view plus one concise user-account counts card (`userCounts`): Total Users, Active Users, per-role counts; deactivated read as Total minus Active, never a separate sourced metric. Each role count drills to User Management with that role filter (`/admin/users?role=<ROLE>`). The card MUST NOT render for Staff. Zero counts render as `0`, never blank.
- Counts MUST match the API exactly; the client MUST NOT aggregate or recompute. Loading, empty, forbidden, and failure states follow §3.

## 5. Actions Taken on Ticket Detail

- Staff Detail MUST contain an `Actions Taken` tab/section: a table (`Date | Description | Result | Performed By | Assignee | Follow-Up | Status | Version`) in stable `actionDate ASC, id ASC` order with status text badges (`PLANNED`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED` — never `OPEN`, never `WORKING` or synonyms without a documented mapping).
  - Create mode: description input, assignee picker (empty = recorder accountable), work-datetime input with explicit "use current time" auto-tick, follow-up toggle revealing the required note field, attachment-notes input. The client MUST NOT trust its own clock beyond display.
- View/Edit mode for `PLANNED`/`IN_PROGRESS` actions: Start (`PLANNED → IN_PROGRESS`), field edits, Complete (result required), Cancel (confirmed). Every save sends the displayed `expectedVersion` and refreshes it from the response. Out-of-range dates, stale versions (`ACTION_STATE_CHANGED` with Refresh), and ineligible assignees MUST surface actionable guidance.
- History mode: per-Action event stream (actor, timestamp, type, change summary) in deterministic order, read-only.
- Complete and Cancel are explicit confirmed actions; terminal actions render read-only. On a `RESOLVED`/`CLOSED`/`CANCELLED` Ticket the entire Actions area renders read-only with no create/edit controls (further work requires Reopen).
- Requester Detail MUST show the same items and history read-only with zero mutation controls. The API enforces this independently of rendering.

## 6. Ticket Workflow and Resolution Feedback

- Status controls MUST list only the permitted transitions for the current state and role.
- When the gate blocks resolution, the resolve control MUST explain which condition failed (open Actions with a link to the Actions tab, or missing current-cycle completion) instead of failing silently. The backend remains authoritative.
- A successful transition MUST refresh the Ticket summary status. `CLOSED` and `CANCELLED` still require confirmation. After reopen, the UI MUST present the Ticket as a fresh cycle (no completed-work carried over visually).

## 7. Common Application States

Loading, field-level validation with first-invalid focus (`400` incl. `ACTION_DATE_OUT_OF_RANGE`), success, empty/no-results, forbidden (`403`), unauthorized (redirect to Login; `401`), conflict with actionable copy and next action (`ACTION_STATE_CHANGED` → Refresh; `INVALID_ACTION_TRANSITION` → read-only explanation; `RESOLUTION_BLOCKED_BY_OPEN_ACTIONS` / `RESOLUTION_REQUIRES_COMPLETED_ACTION` → Actions-tab link; `ACTION_ASSIGNEE_NOT_ELIGIBLE` → reselection; `IDEMPOTENCY_CONFLICT` → no-retry notice), not-found, and safe API-failure states MUST follow Lab 3 patterns. Double-submit MUST be prevented through disabled busy state plus `clientRequestId` idempotency keys. A replayed idempotent response (`Idempotent-Replayed`) MUST render as the original success state, never as a second creation. Recoverable failures MUST preserve entered form data. Console errors, broken links, placeholder text, and unfinished controls MUST NOT ship.

## 8. Responsive Rules (measurable)

- At 1440px, 900px, and 375px widths, both dashboards and the Actions area MUST show no clipped content, no overlapping controls, no inaccessible modal dialogs, and no horizontal page scrolling. Breakpoint strategy follows the existing Lab 2/3 responsive implementation (no new pixel values introduced).
- Tables MUST collapse to cards on mobile; metric cards MUST wrap without overflow.

## 9. Accessibility

Visible focus on every interactive element; full keyboard operation for cards, tabs, transitions, and dialogs (focus trap, Escape to close, focus return); semantic labels on all inputs including the datetime input and auto-tick checkbox; non-color status cues (text plus icon or border); live-region announcements for metric loads, mutation results, and conflict errors.

## 10. Route-Level UI Map

| Route | Who | Content |
|---|---|---|
| `/dashboard` | Requester (guarded) | Requester dashboard (§3) |
| `/staff-dashboard` | IT Staff/Administrator (guarded) | Staff dashboard + Admin counts card (§4) |
| `/tickets/:id` (+ Actions section) | Requester/Staff/Admin | Detail + Actions Taken area with history (§5) |
| `/my-tickets?status=…&state=…` | Requester | My Tickets MUST initialize filters from query (drill-down support per api-spec §4) |
| `/staff/queue?owner=…&assignee=…&itPriority=…&sort=…&order=…` | Staff/Admin | Staff Queue MUST initialize owner, assignee, priority (single or comma-separated levels), and sort from query using the implemented vocabulary |
| `/admin/users?role=…` | Administrator | User Management MUST initialize the role filter from query |
| existing Lab 1–3 routes | Unchanged | Regression baseline; temporary, duplicate, or obsolete elements found MUST be removed |

## 11. Regression and Polish (§8.5)

All earlier screens MUST stay available to permitted users with correct behavior. Duplicate-submit protection, form-data preservation, and feedback consistency apply application-wide. README setup, seed, migration, test, and demonstration instructions MUST be updated wherever Lab 4 changes them.
