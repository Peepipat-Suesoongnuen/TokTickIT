# Lab 3 UI Specification — TokTickIT Zen Green Continuity

Companion contract to [specification.md](./specification.md), [api-spec.md](./api-spec.md), and [tests.md](./tests.md). Lab 3 extends the completed Lab 2 UI rather than redesigning it. Existing Zen Green tokens, spacing, badges, table/card patterns, form states, Attachment interactions, and accessibility conventions remain the baseline unless this file explicitly replaces them.

## 1. Design Continuity from Lab 2

Retain the Lab 2 design system:

| Token / behavior | Lab 3 rule |
|---|---|
| Primary green | `#006B3C` for app header and primary actions |
| Secondary green | `#0B7A46` for active navigation/focus/link emphasis |
| Pale green | `#EAF6EF` for selected/success/subtle emphasis |
| Page background | `#F5F7F6` |
| Surface | `#FFFFFF` with existing subtle Zen border |
| Primary text | `#22332B` |
| Secondary text | `#5B6B62` |
| Read-only field | existing soft gray-green style |
| Error | existing dark-red field/banner treatment |
| Focus | visible ~2 px green outline; never removed |
| Mobile touch target | minimum 44×44 px where applicable |
| Main content width | Requester screens preserve the Lab 2 centered ~1200 px baseline; dense IT Staff/Admin data screens may widen to approximately 1360 px when needed to keep required columns readable without horizontal page scrolling |

Existing Lab 2 patterns remain preferred:

- desktop table → mobile card list;
- labels above controls;
- field-level validation beneath the field;
- first invalid field receives focus;
- loading / empty / no-results / failure are distinct states;
- priority/status meaning is conveyed by text, not color alone;
- modal/dialog focus handling follows the Lab 2 Attachment modal pattern;
- long content wraps or clamps without horizontal page scrolling.

## 2. Role-Aware Application Shell

Replace the Lab 2 selected-Requester chip and `Change Requester` action with authenticated identity.

Desktop concept:

```text
TokTickIT · IT Service Desk                 Alice Example · REQUESTER
                                            [ user menu ▾ ]
---------------------------------------------------------------------
role-specific navigation
```

The authenticated-user menu contains `Change Password` and `Logout`. These actions are not repeated as permanent buttons on every screen.

Detail/create screens use a compact breadcrumb row separated from the primary navigation, for example `My Tickets > Ticket Detail`, `My Tickets > Create Ticket`, and `Ticket Queue > Ticket Detail`.

Navigation by role:

| Role | Navigation |
|---|---|
| Requester | `My Tickets`, `Create Ticket` |
| IT Staff | `Ticket Queue` |
| Administrator | `Ticket Queue`, `User Management` |

Administrator receives Ticket Queue because the approved authorization matrix explicitly permits Staff Ticket operations for the Administrator role.

UI navigation is usability only; direct route/API authorization remains backend-enforced.

Mobile continues the Lab 2 hamburger/collapsible-navigation pattern. The authenticated user name/role remains visible or discoverable without introducing a second navigation system.

## 3. Authentication Screens

### 3.1 Login

Use a compact centered card visually derived from the Lab 2 Requester Selection screen rather than creating a new visual language.

```text
TokTickIT
IT Service Desk

Email
[________________________]

Password
[________________________]

[ Sign In ]
```

Requirements:

- email and password labels are programmatically bound;
- password value is never shown in logs/error details;
- primary Sign In uses Zen Green;
- busy state disables duplicate submission and shows `Signing in…`;
- account-specific login failure uses safe generic copy;
- rate-limit feedback may state that there were too many attempts without exposing account existence;
- network/server failure uses safe retryable feedback.

The Development Requester selector screen is removed from the Lab 3 application flow.

### 3.2 Mandatory Change Password

Users with `mustChangePassword = true` do not enter the normal AppShell.

```text
Change Password

Current Password
[____________________][eye]

New Password
[____________________][eye]

Confirm New Password
[____________________][eye]

Password requirements:
✓/• 8–64 characters
✓/• at least one uppercase letter
✓/• at least one lowercase letter
✓/• at least one special character
✓/• differs from the current password

[ Change Password ]   [ Logout ]
```

`Confirm New Password` is UI-only validation and is not sent to the API.

Each password input has a conventional eye-icon show/hide control with an accessible name. Password requirements appear below `Confirm New Password`; each requirement changes from an unmet bullet to a check mark as the typed New Password satisfies it. There is no self-service Forgot Password flow in Lab 3.

On desktop, `Change Password` and `Logout` use balanced equal-width actions with matching control height. On narrow mobile widths they may remain two balanced columns where readable or stack cleanly without making one action visually dominate the other.

States: initial, validation errors, changing/busy, current-password error, safe API failure, success/continuation into the role-appropriate application.

## 4. Requester Screens

### 4.1 Create Ticket

Preserve the Lab 2 Create Ticket layout and interaction as closely as possible.

Changes from Lab 2:

- `Requester` read-only field is populated from the authenticated user;
- no Requester selector or Change Requester behavior exists;
- authenticated requests do not send requester identity as business input.

Preserve the Lab 2 layout order, validation, busy state, success state, Back to My Tickets navigation, Attachment selection/upload behavior, partial-upload failure behavior, and field constraints.

### 4.2 My Tickets

Preserve the Lab 2 toolbar and seven-column desktop table.

Toolbar:

```text
Search | Category | Requested Priority | Current Status | Rows per page
```

`Current Status` expands from Lab 2 `NEW` only to all eight Lab 3 statuses.

Desktop columns remain:

```text
Ticket Number
Created
Summary
Category
Requested Priority
Current Status
Last Updated
```

Do not add Ticket Owner to Requester My Tickets in Lab 3. This preserves table readability and Lab 2 continuity. Ticket Owner is visible in Requester Ticket Detail instead.

Column sizing keeps header/data starts aligned and prevents the status badge from colliding with `Last Updated`. `Summary` is one visual line with ellipsis when needed. The underlying `WAITING_FOR_REQUESTER` status may display the compact table badge label `WAITING`; filters/detail continue to use the full status meaning.

Retain Lab 2 sortable-header behavior, mobile sort controls, pagination, table→card responsive representation, stale-request protection, empty/no-results distinction, and failure/Retry behavior.

### 4.3 Requester Ticket Detail

Extend the Lab 2 Ticket Detail instead of replacing it.

Read-only Ticket information remains a superset of the My Tickets row. It includes the existing Lab 2 fields plus Requested Priority, Current Status, Last Updated, and:

```text
Assigned To: Bob Staff
```

or:

```text
Assigned To: Unassigned
```

Requester detail keeps Ticket Information visible at the top, then uses a compact section switcher to avoid an unnecessarily long page:

```text
Ticket Information

Public Comments | Attachments | Ticket Actions
```

Internal Notes are not rendered at all for Requesters—not disabled, not empty, and not referenced as hidden content.

The section switcher is a tab-style control. Exactly one lower section is shown at a time. It remains keyboard operable, exposes selected-state semantics, and may scroll horizontally on very narrow screens rather than wrapping into an unreadable control group.

#### Public Comments

```text
Public Comments
--------------------------------------------------
[ Add a public comment… ][ Post Comment ]     0 / 200
--------------------------------------------------
Alice Example · Requester · 2026-09-12 19:30
The issue still happens after restarting.
--------------------------------------------------
Bob Staff · IT Staff · 2026-09-12 19:45
Please try the updated VPN profile.
--------------------------------------------------
```

Rules:

- plain text only;
- 1–200 characters after trim;
- empty state and load/post failure states are explicit;
- posting does not automatically change Ticket status.
- the comment composer sits above the timeline so it remains immediately available even after many comments;
- the composer is intentionally compact: approximately one text line high plus a normal-sized `Post Comment` button aligned with the field.

#### Problem Appears Resolved

`Problem Appears Resolved` appears inside the `Ticket Actions` tab rather than as a permanently expanded section. The enabled action is available only while Current Status is `NEW`, `OPEN`, `IN_PROGRESS`, `WAITING_FOR_REQUESTER`, or `REOPENED`; `RESOLVED`, `CLOSED`, and `CANCELLED` do not expose an enabled action. Provide a clear action with explanatory copy, for example:

```text
[ Problem Appears Resolved ]
Let IT know that the reported problem appears resolved. This does not close the ticket.
```

Use a lightweight confirmation/guard against accidental activation; it does not need a heavy destructive modal.

After success:

```text
✓ You indicated that the problem appears resolved.
```

The Current Status badge remains unchanged by this action.

## 5. IT Staff Ticket Queue

The Queue reuses the Lab 2 My Tickets visual language: heading/actions, filter toolbar card, desktop table, mobile cards, sortable controls, pagination, and explicit loading/empty/no-results/forbidden/failure states.

Toolbar:

```text
Search
Category
Requested Priority
IT Priority
Current Status
Owner
Rows per page
```

Owner choices include:

```text
All Owners
Unassigned
My Tickets
eligible/historical owner values returned by the API as applicable
```

Desktop table uses the fields that correspond to the approved queue filters while keeping one-line cells where needed. Final columns:

```text
Ticket Number
Summary
Category
Requested Priority
IT Priority
Current Status
Ticket Owner
Last Updated
```

`Summary`, `Category`, and `Ticket Owner` are single-line/clamped where needed; the Staff desktop content area may be wider than Requester My Tickets to keep these eight columns readable. Header text and badge/cell content use the same left edge. Queue rows do not place a requester-resolution checkmark beside Ticket Number or Status; the plain-text indication is shown in Ticket Detail instead.

Mobile card example:

```text
2609-0012                                  CRITICAL
Unable to connect to VPN

Network
Requested: HIGH
Status: IN PROGRESS
Owner: Bob Staff
Updated: 2026-09-12 20:10
```

## 6. IT Staff Ticket Detail

Extend the Lab 2 Ticket Detail and keep non-operational Ticket data read-only.

Ticket Information is visible first, followed by a tab-style lower-section switcher:

```text
Ticket Information

Public Comments | Internal Notes | Attachments | Ticket Actions
```

### 6.1 Ticket Information

Read-only information is a superset of the Queue row and includes Ticket Number/Date, Requester, Category, Related System, Summary, Description, Requested Priority, IT Priority, Current Status, Ticket Owner, Last Updated/relevant timestamps, and Requester Resolution Indication. The indication is plain text such as `Problem appears resolved`; no checkmark glyph is used.

### 6.2 Ticket Operations

```text
Ticket Owner
[ Bob Staff ▼ ]             or [ Claim Ticket ] when unassigned

IT Priority
[ HIGH ▼ ]

Current Status
[ IN PROGRESS ▼ ]
```

Rules:

- Claim appears only where claiming an unassigned Ticket is valid;
- owner selector is populated by eligible active Staff/Admin users;
- Requested Priority remains read-only;
- IT Priority is editable only for permitted non-terminal states;
- status control offers only currently permitted next transitions;
- reassigning does not implicitly change status;
- `CLOSED` and `CANCELLED` operation controls are read-only except a permitted Reopen path from Closed;
- selecting/confirming `CLOSED` or `CANCELLED` requires a confirmation dialog;
- stale `409 TICKET_STATE_CHANGED` shows `Ticket has changed. Refresh and try again.` with a Refresh action rather than silently overwriting newer data;
- `409 OWNER_NOT_ELIGIBLE` shows that the selected owner is no longer eligible and asks the user to Refresh/reselect an eligible owner rather than silently retrying with stale owner data.

For `CLOSED → REOPENED` where the historical owner is no longer eligible, UI requires selecting a valid replacement owner before submitting Reopen.

### 6.3 Attachments

Reuse the Lab 2 Attachment visual/component behavior. Staff/Admin may view Attachment metadata and download authorized Ticket Attachments. Lab 3 does not add Staff/Admin upload/remove actions; Requester Attachment mutation remains governed by the existing Requester Attachment contract. No new Attachment model is introduced.

### 6.4 Communication

Public and private channels must be visually and semantically distinct.

```text
Public Comments
Visible to Requester, IT Staff and Administrators

[ Add public comment… ][ Post Comment ]     0 / 200
[ timeline ]
```

and separately:

```text
🔒 Internal Notes
Visible only to IT Staff and Administrators

[ Add internal note…                         ]
[ multiline / auto-grow textarea             ] [ Add Note ]    0 / 2000
[ private note timeline ]
```

Internal Notes use a neutral/amber private emphasis while remaining part of the Zen Green system. The UI must use explicit words (`Internal Notes`, `Visible only…`) and not rely on color alone.

The Public Comment composer uses 1–200 characters and remains a compact one-line-height control. Internal Notes use 1–2,000 characters and use a multiline textarea with a reasonable initial height that auto-grows with content (and may allow vertical resize) rather than forcing a 2,000-character note into one line. Both composers remain at the top of their tab and have safe loading/empty/submitting/failure states.

## 7. Administrator User Management

The Administrator interface is intentionally minimalist.

### 7.1 User list

```text
User Management             [ Clear Filters ] [ Refresh ] [ Create User ]

Search name or email
Role [ All Roles ▼ ]

-------------------------------------------------------
Name            Email                  Role              Status
Alice Example   alice@example.com      Requester         Active
Bob Staff       bob@example.com        IT Staff          Active
-------------------------------------------------------
```

Desktop columns are exactly focused on the required workflow:

```text
Name
Email
Role
Status
```

The full desktop row opens Edit User; there is no separate Edit button/column. The row is keyboard reachable/operable. Mobile uses the same information hierarchy in a clickable/focusable user card with no Edit button. Search and the optional Role filter are the only Lab 3 list-narrowing controls; Status remains visible as a column/card value and editable account property, not a list filter. Advanced mandatory pagination/multi-column sorting/bulk actions or multiple simultaneous list filters are not added.

Role and Status badges reuse the same bordered, fixed-height highlight family as Ticket priority/status badges rather than a separate lightweight pill style.

### 7.2 Create User dialog/form

```text
Create User

Name *
Email *
Role *
Active [✓]
Initial Password *
[eye icon]

password requirements…

[ Cancel ] [ Create User ]
```

Success does not echo the password.

Initial-password fields use the same accessible eye-icon show/hide pattern as Change Password.

### 7.3 Edit User dialog/form

```text
Edit User

Name *
Email *
Role *
Active [✓]

[ Set New Initial Password ]

[ Cancel ] [ Save Changes ]
```

`mustChangePassword`, lock state, counters, and password hash are not directly editable controls.

### 7.4 Set New Initial Password dialog

```text
Set New Initial Password

New Initial Password *
[eye icon]
Confirm Password *
[eye icon]

[ Cancel ] [ Set Password ]
```

On success:

```text
Initial password updated. The user must change it at next sign-in.
```

### 7.5 Administrator safety feedback

Business-state conflicts should be actionable, for example:

```text
Cannot deactivate your own account.
At least one active Administrator must remain.
Reassign this user's active tickets before changing the role or deactivating the account.
```

These are not generic unexpected-error cases.

## 8. Badge and Visual Semantics

### 8.1 Priorities

Reuse the Lab 2 priority badge family for both Requested Priority and IT Priority. Labels around the badge must make clear which priority is being shown.

```text
LOW
MEDIUM
HIGH
CRITICAL
```

### 8.2 Statuses

Extend the Lab 2 `NEW` badge pattern to:

```text
NEW
OPEN
IN PROGRESS
WAITING FOR REQUESTER
RESOLVED
CLOSED
REOPENED
CANCELLED
```

Use restrained Zen/neutral/warning/success/muted families rather than eight unrelated decorative colors. Every badge always includes text.

In dense table rows, the underlying `WAITING_FOR_REQUESTER` state may render as `WAITING` to keep the badge on one line. This is a presentation label only; the API/business status remains `WAITING_FOR_REQUESTER`.

Table badge alignment and sizing are consistent across Requester, IT Staff, and Administrator lists:

- priority/status/role highlights use a consistent fixed-height bordered family;
- the left edge of a badge aligns with the first character of its column header/data start rather than floating centered inside the cell;
- `NEW` renders as text only with no decorative leading dot;
- `CLOSED` uses the same muted/neutral visual family as `LOW` priority so the two approved states remain visually consistent without implying extra severity;
- these are presentation rules only and do not change the underlying API values.

### 8.3 Role badge

Role uses the same bordered, fixed-height Zen highlight family as priority/status badges:

```text
REQUESTER
IT STAFF
ADMINISTRATOR
```

Role display is informational, not authorization.

## 9. Common Application States

Every data-driven screen supports the relevant states:

```text
Loading
Success
Saving/Submitting
Validation Failure
Empty
No Results
Forbidden
Not Found / hidden protected resource
API Failure + Retry
```

Authentication-specific route behavior:

| API state | UI response |
|---|---|
| `401` | transition to Login / authenticated session lost state |
| `403 PASSWORD_CHANGE_REQUIRED` | transition to mandatory Change Password |
| role/action `403` | safe “You do not have permission to access this function.” |
| protected `404` | safe Ticket/resource-not-found view without existence leak |

Never render raw stack traces, fetch internals, Prisma/SQL messages, tokens, or secrets.

## 10. Responsive Rules

Continue the Lab 2 viewport convention:

| Viewport | Behavior |
|---|---|
| Desktop ≥992 px | centered max-width content, multi-column forms where useful, tables visible |
| Tablet 768–991 px | controls wrap/reflow without horizontal page scrolling |
| Mobile <768 px | stacked controls, full-width touch-friendly actions, tables replaced by cards |

Across all sizes:

- no clipped labels or hidden required actions;
- no unintended horizontal page scrolling;
- dialogs fit the viewport and remain operable;
- long Summary may visually clamp in lists while full text remains accessible in Detail;
- long filenames/content wrap safely;
- Queue/User Management mobile cards retain the same information hierarchy as their desktop tables.

## 11. Accessibility

- Labels are programmatically bound to native controls where possible.
- Active navigation and pagination use `aria-current` where appropriate.
- Sortable table headers use accessible button semantics and `aria-sort`.
- Success/error/status changes use suitable `aria-live` announcements.
- Modals/dialogs have an accessible name, focus moves into them, Escape closes where safe, focus is trapped while open, and focus returns to the trigger on close.
- First invalid form control receives focus after validation failure.
- Keyboard focus remains visibly distinguishable against all surfaces.
- Status, priority, role, public/private meaning, and errors do not rely on color alone.
- Icon-only controls have accessible names.
- Disabled and read-only states remain semantically and visually distinct.

## 12. Route-Level UI Map

Indicative client routes:

```text
/login
/change-password

/my-tickets
/create
/tickets/:id

/staff/tickets
/staff/tickets/:id

/admin/users
```

Administrator may access `/staff/*` under the explicit project authorization matrix. Requester cannot. Route guards improve UX but the backend remains authoritative.

## 13. Visual Regression / Mockup Reference Rules

- Lab 2 rendered behavior and `docs/lab-02/ui-spec.md` are the continuity baseline for Requester screens.
- Lab 3 local mockups may be reviewed by role: unauthenticated/auth, Requester, IT Staff, Administrator, but `artifacts/lab-03/mockups/` is planning-only and is not a GitHub deliverable.
- Mockups guide layout and information hierarchy only; implementation evidence is judged against this approved UI contract and labsheet intent rather than pixel-perfect mockup equality.
- Representative desktop and mobile views are required for My Tickets, Staff Queue, Staff Ticket Detail, and User Management; other screens may use one representative viewport plus responsive verification where sufficient.
