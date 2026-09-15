# Lab 3 Sprint Engineering Specification — TokTickIT Authentication, Staff Workflow, and Administration

Companion contract to [api-spec.md](./api-spec.md), [ui-spec.md](./ui-spec.md), and [tests.md](./tests.md). This document evolves the completed Lab 2 increment; where Lab 3 does not explicitly replace a Lab 2 behavior, the Lab 2 requester behavior remains the regression baseline.

## 1. Sprint Goal

Evolve TokTickIT from the Lab 2 Development Requester simulation into a secure authenticated service-desk application with one role per user, protected Requester ownership, an operational IT Staff queue/detail workflow, Public Comments and private Internal Notes, and intentionally minimalist Administrator user management, while preserving the completed Lab 2 Ticket and Attachment data and requester experience.

## 2. Stakeholder Request

The temporary Requester selector is replaced with real email/password login. Requesters continue using the Lab 2 Ticket and Attachment functions under their authenticated identity. IT Staff need a shared queue, Ticket Detail, assignment, IT Priority, status workflow, Public Comments, and Internal Notes. Administrators need only the account-management functions required for this sprint: list/search users, create and edit one-role accounts, activate/deactivate accounts, and set a new initial password. Security decisions must be explicit, testable, and enforced at the backend rather than by hidden UI controls.

## 3. Scope

### Included

- Email/password authentication, safe login failures, current-user retrieval, logout, absolute session expiration, and mandatory first-login password change.
- Exactly one role per user: `REQUESTER`, `IT_STAFF`, or `ADMINISTRATOR`.
- Role-aware navigation plus backend authorization based on authenticated identity, role, resource ownership, action, and workflow state.
- Migration of Lab 2 `DevelopmentRequester` identities into the Lab 3 `User` model without losing existing Ticket, Attachment, Category, or Related System data.
- Continued authenticated Requester Create Ticket, My Tickets, Ticket Detail, and Attachment lifecycle behavior from Lab 2.
- Requester Public Comments and a “Problem Appears Resolved” indication that does not formally resolve or close a Ticket.
- IT Staff shared Ticket Queue and Ticket Detail workflow: claim, assign/reassign primary owner, IT Priority, approved status transitions, Public Comments, and Internal Notes.
- Administrator Ticket operations explicitly permitted by this project’s authorization matrix, plus Administrator-only minimalist User Management.
- Responsive Zen Green UI continuity, accessibility, safe feedback states, security-negative tests, migration/regression tests, and end-to-end evidence.

### Explicitly Excluded

- Email invitation/reset delivery, MFA, social login, OAuth/OIDC/SSO, self-registration, and Requester-created accounts.
- Multiple roles per user, user deletion, bulk user operations, import/export, role history, account-history screens, departments, profile photos, or advanced identity-management workflows.
- Standalone administrator account-unlock workflow; setting a new initial password may clear the target account’s login-lock state as part of that approved operation.
- Actions Taken, SLA calculations, escalations, notifications, dashboards/KPI analytics, multi-tenancy, or production/cloud infrastructure work.
- Status-history/audit-trail model in Lab 3; only the current status is stored. A future sprint may add status history.
- Comment/note attachments, comment/note edit/delete, Ticket deletion, or advanced rich-text editing.

## 4. Functional Requirements

- **FR-01** The system shall authenticate a user by email address and password.
- **FR-02** The system shall require a user with an initial password to change it successfully before entering the normal application.
- **FR-03** The system shall maintain authenticated identity, expose the safe current authenticated user, and provide logout.
- **FR-04** The UI shall present role-appropriate navigation and actions while backend authorization independently protects every restricted operation.
- **FR-05** Requester operations shall use the authenticated Requester identity and shall remove the Lab 2 Development Requester selector and Change Requester mechanism.
- **FR-06** An authenticated Requester shall continue to create Tickets, list/search/filter/sort/paginate their own Tickets, open owned Ticket Detail, and use permitted Lab 2 Attachment functions.
- **FR-07** A Requester shall view and add Public Comments on their own Tickets.
- **FR-08** A Requester shall be able to indicate that the reported problem appears resolved without directly setting the Ticket to `RESOLVED` or `CLOSED`.
- **FR-09** IT Staff shall have a shared Ticket Queue with approved search, filters, sorting, and pagination.
- **FR-10** IT Staff shall open Ticket Detail containing the information needed to work a Ticket.
- **FR-11** Authorized staff-side users shall claim an unassigned Ticket and assign/reassign one primary Ticket Owner according to the authorization and owner-eligibility rules.
- **FR-12** Authorized staff-side users shall set and update IT Priority independently of the Requester’s Requested Priority.
- **FR-13** Authorized staff-side users shall update Current Status only through the approved workflow.
- **FR-14** Authorized staff-side users shall view/add Public Comments and role-restricted Internal Notes with clear visibility boundaries.
- **FR-15** Administrators shall list users, search by name/email, and optionally filter by role. Activation status remains visible in the list but is not an additional list filter in Lab 3.
- **FR-16** Administrators shall create a user with name, email, exactly one permitted role, activation state, and initial password.
- **FR-17** Administrators shall update a user’s name, email, role, and activation state and shall set a new initial password that requires change at the next login.
- **FR-18** The Lab 2 Development Requester model shall be migrated/evolved into User/Role while preserving existing requester Ticket relationships, Attachments, reference data, and supported Requester behavior.

## 5. Business Rules

### Authentication, credentials, and sessions

- **BR-01** Only an active user with valid credentials may authenticate.
- **BR-02** A user marked as requiring a password change cannot enter the normal application until a new valid password is saved.
- **BR-03** Requester-scoped operations derive requester identity from the authenticated context; a client-supplied `requesterId` cannot determine or override Requester ownership.
- **BR-04** Public Comments are visible to Requester, IT Staff, and Administrator when that role is otherwise authorized for the Ticket. Internal Notes are visible only to IT Staff and Administrator and are never returned through Requester APIs.
- **BR-05** A Requester may indicate that the problem appears resolved only while Current Status is `NEW`, `OPEN`, `IN_PROGRESS`, `WAITING_FOR_REQUESTER`, or `REOPENED`. The action is rejected in `RESOLVED`, `CLOSED`, and `CANCELLED`, never changes formal Current Status, and cannot be used to formally resolve or close a Ticket.
- **BR-06** Current user ID, role, activation state, and mandatory-password-change state come from backend authentication state, not editable client fields.
- **BR-07** Logout makes the previously authenticated session unusable for protected requests.
- **BR-08** Passwords are 8–64 Unicode code points, contain at least one uppercase letter, one lowercase letter, and one special character, and a changed password must differ from the current password. Password input is not trimmed, Unicode-normalized, or silently truncated before hashing. A digit is allowed but not required.
- **BR-09** Account-specific authentication failures use safe generic feedback and do not disclose whether an email exists, a password was wrong, or an account is inactive or locked.
- **BR-10** Passwords and initial passwords are never stored or logged in plaintext and are never returned in API responses or evidence. Password storage uses Argon2id with a unique random salt per hash and PHC-encoded parameters. The Lab 3 baseline is memory cost `m=19456` KiB, time cost `t=2`, and parallelism `p=1`; parameters may be raised after performance verification but must not be silently weakened.
- **BR-11** Administrator-created accounts and Administrator-set new initial passwords set `mustChangePassword = true`; the flag is cleared only after a successful valid password change.
- **BR-12** An invalid password-change attempt leaves the existing credential and mandatory-password-change state unchanged.
- **BR-13** Five consecutive incorrect-password attempts for an existing account lock that account for 15 minutes. A successful login before the threshold resets the counter. The lock expires automatically. Correct credentials are rejected while the account is locked. Setting a new initial password clears failed-attempt/lock state. IP-level rate limiting is an additional control; its exact threshold is configuration, not a business rule. Nonexistent emails do not create account-lock records.
- **BR-14** Deactivating a user makes any previously issued session unusable for protected requests.
- **BR-15** The current-user response contains only safe data required by the client: `id`, `name`, `email`, `role`, `active`, and `mustChangePassword`.
- **BR-16** An authenticated session has an absolute maximum age of 8 hours with no sliding extension. At exactly the expiration instant it is expired. Time-dependent tests use a controllable clock.
- **BR-17** A successful password change invalidates sessions created with the prior credential; the application may establish one fresh current session after the change.
- **BR-18** Setting a new initial password as Administrator invalidates all sessions for the target user; the target must log in with the new initial password and then complete the mandatory password change.

### Authorization and resource protection

- **BR-19** Every protected backend operation authorizes using authenticated user, role, action, target resource, ownership, and relevant workflow state. Hidden UI controls are not authorization.
- **BR-20** Requester Ticket and Attachment operations are limited to Tickets submitted by the authenticated Requester.
- **BR-21** `ADMINISTRATOR` remains a distinct single role. For this project’s explicit authorization matrix, an Administrator also receives the IT Staff Ticket operational permissions in addition to Administrator-only User Management. This is an explicit project decision, not an assumed role hierarchy.
- **BR-22** A Ticket has zero or one primary owner. For a non-terminal Ticket, a non-null owner must be an active `IT_STAFF` or `ADMINISTRATOR`. Closed/Cancelled Tickets may retain a historical owner who later becomes inactive or changes role.
- **BR-23** Authorized IT Staff/Administrator users may claim an unassigned Ticket for themselves or assign/reassign the Ticket to an eligible active IT Staff/Administrator user.
- **BR-24** Requested Priority remains the Requester-submitted value. IT Priority is a separate value, initially copied from Requested Priority at Ticket creation or migration and mutable only by IT Staff/Administrator.

### Ticket status workflow

- **BR-25** Current Status is exactly one of `NEW`, `OPEN`, `IN_PROGRESS`, `WAITING_FOR_REQUESTER`, `RESOLVED`, `CLOSED`, `REOPENED`, or `CANCELLED`.
- **BR-26** A newly created Ticket starts in `NEW`.
- **BR-27** The first successful Claim or owner assignment of a `NEW` Ticket atomically assigns the owner and changes `NEW → OPEN`.
- **BR-28** `OPEN → IN_PROGRESS` is an explicit IT Staff/Administrator action.
- **BR-29** Reassignment after the first assignment does not change Current Status.
- **BR-30** `IN_PROGRESS → WAITING_FOR_REQUESTER` and `WAITING_FOR_REQUESTER → IN_PROGRESS` are explicit IT Staff/Administrator actions. A Requester comment does not automatically change status.
- **BR-31** IT Staff/Administrator may resolve only from `IN_PROGRESS` or `WAITING_FOR_REQUESTER`.
- **BR-32** `RESOLVED → CLOSED` is permitted. `RESOLVED → REOPENED` and `CLOSED → REOPENED` are permitted. `REOPENED → IN_PROGRESS` is then explicit.
- **BR-33** IT Staff/Administrator may cancel from `NEW`, `OPEN`, `IN_PROGRESS`, `WAITING_FOR_REQUESTER`, or `REOPENED`. `CANCELLED` is terminal. Direct `RESOLVED → CANCELLED` and `CLOSED → CANCELLED` are forbidden; if necessary, a resolved Ticket must first be reopened. Cancellation means current work is intentionally discontinued and does not erase prior history.

### Public Comments and Internal Notes

- **BR-34** Public Comments and Internal Notes are append-only in Lab 3; no edit or delete operation is provided.
- **BR-35** Comment/note author and creation time are set by the backend from authenticated identity and server time; the client cannot override them.
- **BR-36** Comment/note content is trimmed and whitespace-only content is rejected.
- **BR-37** User-provided comment/note content is plain text and must never be interpreted as executable HTML or script.
- **BR-38** Public Comment content length is 1–200 characters after trimming. Internal Note content length is 1–2,000 characters after trimming.

### User-management safety

- **BR-39** Every user has exactly one role: `REQUESTER`, `IT_STAFF`, or `ADMINISTRATOR`.
- **BR-40** Email addresses are unique under case-insensitive comparison.
- **BR-41** Users are not deleted in Lab 3; deactivation is used instead.
- **BR-42** An Administrator cannot deactivate the currently authenticated Administrator account.
- **BR-43** At least one active Administrator must always remain. Deactivation or changing the role away from `ADMINISTRATOR` is rejected if it would leave zero active Administrators.
- **BR-44** Setting a new initial password follows BR-08, BR-11, BR-13, and BR-18.
- **BR-45** A Staff/Admin user who owns any non-terminal Ticket cannot be deactivated or changed to a non-owner-eligible role until those Tickets are reassigned or otherwise no longer require an eligible primary owner. Closed/Cancelled historical ownership does not block later deactivation/role change.
- **BR-46** Emails are trimmed and normalized for authentication and uniqueness using case-insensitive canonicalization; accounts cannot differ only by case.
- **BR-47** An Administrator multi-field update succeeds only if the complete resulting User state satisfies email, one-role, last-admin, self-deactivation, and owner-integrity rules. Invalid updates are rejected atomically without partial changes.

### Migration and data continuity

- **BR-48** Requester/submitted-by ownership and operational Ticket Owner/assigned-to ownership are distinct relationships.
- **BR-49** Migration preserves each Lab 2 `DevelopmentRequester → Ticket` relationship when evolving Requesters into Users.
- **BR-50** Existing Tickets, Attachments, Categories, Related Systems, and Lab 2 requester data are preserved; migration must not discard and recreate the dataset as a shortcut.
- **BR-51** Supported Lab 2 Requester Ticket and Attachment functions continue after migration except the Development Requester selector/change-requester mechanism, which is removed and replaced by authenticated identity.
- **BR-52** Each migrated Requester receives an approved deterministic local-development initial password, stored only as a secure hash, with `mustChangePassword = true`. Documented seeded credentials are local/testing credentials only and must never be real personal secrets.

### Session, CSRF, and request-boundary decisions

- **BR-53** Authentication uses server-side opaque sessions stored in PostgreSQL. The browser receives an opaque random session token; only a cryptographic hash of that token is stored in the database.
- **BR-54** The session token is carried by an HttpOnly cookie and is not stored in `localStorage` or `sessionStorage`.
- **BR-55** TokTickIT is a first-party same-application web client. Every state-changing request (`POST`, `PUT`, `PATCH`, `DELETE`) must carry an `Origin` that exactly matches a configured approved application origin, including unauthenticated Login and authenticated password/logout/ticket/admin mutations. Missing `Origin`, `Origin: null`, or an unapproved Origin is rejected with safe `403 ORIGIN_NOT_ALLOWED` before mutation or account/resource-specific processing. The session cookie uses `SameSite=Lax`; a separate synchronizer-CSRF-token subsystem is not required for Lab 3 under this architecture but must be reconsidered if cross-site authenticated requests become required.
- **BR-56** Protected request validation checks session existence/expiry, user existence, activation state, mandatory-password gate, role, and resource/action authorization before completing the operation.
- **BR-57** While `mustChangePassword = true`, only current-user retrieval, password change, logout, and strictly necessary authentication operations are allowed; normal application APIs are blocked.
- **BR-58** Login first satisfies the BR-55 Origin policy, then normalizes email, applies IP rate limiting, and for an existing account evaluates lock, credential, activation, failed-attempt counters, and session creation. Account-specific failures remain generic; a rate-limit response may be distinct.
- **BR-59** Current-user retrieval returns the safe User representation only. Missing, invalid, expired, or inactive authentication returns `401`; invalid sessions may be revoked.
- **BR-60** Logout is idempotent: it revokes the current server-side session and clears the cookie; repeating logout is harmless.
- **BR-61** Password change accepts current password and new password. Confirmation is a UI-only field. On success, the hash is updated, `mustChangePassword` becomes false, all prior sessions are invalidated, and a fresh session may be issued. Invalid attempts cause no partial update.
- **BR-62** Administrator set-initial-password atomically updates the password hash, sets `mustChangePassword = true`, resets failed-attempt/lock state, and invalidates all target-user sessions. Password/hash values are never returned.
- **BR-63** API errors use `{ "error": { "code", "message" } }`; field-level validation may additionally include top-level `fieldErrors`, preserving the Lab 2 error-envelope convention.
- **BR-64** Common HTTP semantics are: `400` invalid request, `401` no valid authentication, `403` authenticated but forbidden/mandatory gate, `404` missing or intentionally hidden protected resource, `409` valid request conflicting with current business state, `413` oversized attachment, `415` unsupported attachment type, `429` rate limit, and safe `500` unexpected failure.
- **BR-65** Request contracts are strict: unknown query parameters, duplicate query parameters, invalid enum/type values, and unknown JSON body fields are rejected rather than silently ignored.
- **BR-66** Existing business entity IDs remain positive integer IDs; the session secret is not a business ID and is opaque/random.
- **BR-67** API timestamps are ISO 8601 UTC values. User-facing local formatting is a UI concern and continues to use Asia/Bangkok where Lab 2 did so.
- **BR-68** Client-provided role, requester identity, author identity, timestamps, or other security-sensitive identity fields are never accepted as authorization authority.
- **BR-69** Multi-state business operations that must succeed together are atomic transactions, including first Claim/assignment, status+owner repair on reopen, Administrator safety updates, and initial-password reset/session invalidation.
- **BR-70** Targeted optimistic concurrency is used for high-collision Ticket mutations: Claim requires owner still null; reassign includes `expectedOwnerId`; IT Priority includes `expectedItPriority`; status includes `expectedCurrentStatus`. Stale mutations return `409 TICKET_STATE_CHANGED`.
- **BR-71** `GET /api/categories` and `GET /api/related-systems` remain authenticated reference-data APIs without `requesterId`. The Lab 2 `/api/requesters` selector endpoint is removed from normal Lab 3 application flow.
- **BR-72** Credentialed CORS is environment-aware and allow-lists only configured application origins. Approved browser origins may receive the exact matching `Access-Control-Allow-Origin` plus credential support; missing, `null`, or unapproved origins do not receive credentialed CORS authorization. Production/same-origin deployment should prefer same-origin frontend/API. `Access-Control-Allow-Origin: *` is never used with credentialed authentication.
- **BR-73** Responses expose only data needed by the authorized UI and never password hashes, raw session tokens, session-token hashes, failed-attempt counters, lock timestamps, or unrelated secret/security metadata.
- **BR-74** Client input is untrusted. Database values use Prisma/ORM or parameterized queries; query-structure inputs such as sort fields are allow-listed. User-authored Summary, Description, Comments, Notes, and removal reason are rendered safely as text.
- **BR-75** The Lab 3 seed is non-destructive on rerun. A clean database receives the required baseline accounts/tickets/comments/notes; rerunning seed creates missing canonical fixtures but does not reset mutable state of existing seeded entities, including password hashes, roles, activation state, mandatory-password state, failed-login/lock state, Ticket owner, IT Priority, Current Status, or Requester resolution indication.

### Authorization matrix

| Capability | Requester | IT Staff | Administrator |
|---|---:|---:|---:|
| Login / current user / logout / password change | Own account | Own account | Own account |
| Create Ticket | Allow | Deny | Deny |
| My Tickets / own Requester Detail | Own only | Deny | Deny |
| Requester Attachment operations | Own Ticket only | Deny | Deny |
| Public Comments | Own Ticket | Authorized Ticket | Authorized Ticket |
| Problem Appears Resolved | Own Ticket | Deny | Deny |
| Shared Ticket Queue / Staff Detail | Deny | Allow | Allow (explicit project rule) |
| Claim / assign / reassign owner | Deny | Allow | Allow |
| Change IT Priority / permitted status | Deny | Allow | Allow |
| Internal Notes | Deny | Allow | Allow |
| Eligible primary Ticket Owner | No | Yes if active | Yes if active |
| User Management | Deny | Deny | Allow |

### Status transition matrix

| From | To | Who | Notes |
|---|---|---|---|
| `NEW` | `OPEN` | IT Staff/Admin | Only through first Claim/Assign; owner+status atomic |
| `NEW` | `CANCELLED` | IT Staff/Admin | Explicit cancellation |
| `OPEN` | `IN_PROGRESS` | IT Staff/Admin | Explicit |
| `OPEN` | `CANCELLED` | IT Staff/Admin | Explicit cancellation |
| `IN_PROGRESS` | `WAITING_FOR_REQUESTER` | IT Staff/Admin | Explicit |
| `IN_PROGRESS` | `RESOLVED` | IT Staff/Admin | Formal resolution |
| `IN_PROGRESS` | `CANCELLED` | IT Staff/Admin | Explicit cancellation |
| `WAITING_FOR_REQUESTER` | `IN_PROGRESS` | IT Staff/Admin | Requester reply does not auto-transition |
| `WAITING_FOR_REQUESTER` | `RESOLVED` | IT Staff/Admin | Formal resolution |
| `WAITING_FOR_REQUESTER` | `CANCELLED` | IT Staff/Admin | Explicit cancellation |
| `RESOLVED` | `CLOSED` | IT Staff/Admin | Confirmation required in UI |
| `RESOLVED` | `REOPENED` | IT Staff/Admin | Clears Requester resolution indication |
| `CLOSED` | `REOPENED` | IT Staff/Admin | If historical owner is ineligible, an eligible replacement owner is supplied atomically |
| `REOPENED` | `IN_PROGRESS` | IT Staff/Admin | Explicit |
| `REOPENED` | `CANCELLED` | IT Staff/Admin | Explicit cancellation |
| `CANCELLED` | — | — | Terminal |

`RESOLVED → CANCELLED`, `CLOSED → CANCELLED`, direct `NEW → OPEN` through the generic status endpoint, `NEW/OPEN → RESOLVED`, and all unlisted transitions are forbidden.

## 6. UI Specification Summary

- Preserve the Lab 2 Zen Green tokens, typography, spacing, form states, table/card patterns, badges, responsive behavior, focus treatment, Attachment component behavior, and safe feedback patterns.
- Replace the Development Requester selector with Login and mandatory Change Password flows; replace the shell requester chip/change-requester action with authenticated user name/role and a compact user menu containing Change Password and Logout. Password inputs use a conventional accessible eye icon for show/hide.
- Requester Create Ticket and My Tickets stay visually and behaviorally close to Lab 2. My Tickets keeps the Lab 2 seven-column desktop table; the Current Status filter expands to all eight statuses.
- Requester Ticket Detail extends the Lab 2 screen and remains a superset of My Tickets data: Requested Priority, Current Status, Last Updated, and Assigned To remain visible together with Public Comments, Attachments, and Problem Appears Resolved; Internal Notes are not rendered at all.
- IT Staff Ticket Queue reuses the Lab 2 toolbar/table/mobile-card language. The approved desktop columns are Ticket Number, Summary, Category, Requested Priority, IT Priority, Current Status, Ticket Owner, and Last Updated. Summary, Category, and Owner remain single-line/clamped where needed to keep rows readable.
- IT Staff Ticket Detail is a superset of Queue data: Requested Priority, IT Priority, Current Status, Ticket Owner, Last Updated, Requester, Category, Related System, Summary, Description, and Requester Resolution Indication are visible before role-appropriate operations. Public Comments, Internal Notes, Attachments, and Ticket Actions use a compact tab switcher.
- Administrator User Management is intentionally simple: Name, Email, Role, and Status columns; search name/email plus an optional Role filter; Clear Filters, Refresh, and Create User actions. Status remains a displayed column and editable account property, not a list filter. A desktop row or mobile card opens Edit User directly, so no separate Edit column/button is used. Create/Edit and Set New Initial Password forms use the same Zen Green controls and accessible password eye-toggle pattern.
- `CLOSED` and `CANCELLED` status actions require confirmation in the UI. Security enforcement remains backend-owned.
- Full screen-level detail, states, responsive rules, and accessibility requirements are defined in [ui-spec.md](./ui-spec.md).

## 7. Data Changes

### User

| Field | Type | Constraints |
|---|---|---|
| `id` | Int | PK; preserve/migrate Lab 2 Requester identity mapping |
| `name` | String | Required |
| `email` | String | Required; canonicalized; case-insensitive unique |
| `passwordHash` | String | Required; never plaintext |
| `role` | Enum | exactly one of `REQUESTER`, `IT_STAFF`, `ADMINISTRATOR` |
| `isActive` | Boolean | Required |
| `mustChangePassword` | Boolean | Required |
| `failedLoginAttempts` | Int | Required; default 0 |
| `lockedUntil` | DateTime? | Nullable |
| `createdAt` / `updatedAt` | DateTime | UTC |

### Session

| Field | Type | Constraints |
|---|---|---|
| `id` | Int | PK/autoincrement or equivalent internal row identifier |
| `userId` | Int | FK → User; indexed |
| `tokenHash` | String | Unique; hash of opaque browser token; raw token is not stored |
| `expiresAt` | DateTime | Absolute 8-hour expiry |
| `createdAt` | DateTime | UTC |

Expired sessions may be removed lazily/periodically; cleanup strategy does not change authorization semantics.

### Ticket changes

Retain all Lab 2 Ticket fields. Evolve requester FK to User and add:

| Field | Type | Constraints |
|---|---|---|
| `requesterId` | Int | FK → User; historical submitter; immutable |
| `ticketOwnerId` | Int? | FK → User; zero/one operational owner |
| `requestedPriority` | Enum | Lab 2 value preserved |
| `itPriority` | Enum | initialized from Requested Priority |
| `currentStatus` | Enum | eight Lab 3 statuses |
| `requesterResolutionIndicatedAt` | DateTime? | server timestamp; cleared on Reopen |

Requester/submitted-by and Ticket Owner/assigned-to are distinct. A User who later changes role may remain referenced as the historical Requester for old Tickets. Closed/Cancelled Tickets may retain historical owner references even if that User later becomes inactive or changes role.

### PublicComment

`id`, `ticketId` FK, `authorId` FK → User, `content` (1–200 chars after trim), `createdAt` UTC. Append-only.

### InternalNote

`id`, `ticketId` FK, `authorId` FK → User, `content` (1–2,000 chars after trim), `createdAt` UTC. Append-only and queried only through Staff/Admin authorization paths.

### Existing concepts retained

`Category`, `RelatedSystem`, `Attachment`, Ticket Number generation, Attachment soft-removal metadata, and Lab 2 Ticket fields remain valid unless explicitly evolved above.

### Migration

- Migrate/evolve each `DevelopmentRequester` to a `User` while preserving the requester IDs or using an explicit deterministic mapping that keeps every existing Ticket’s requester relationship correct.
- Detect case-insensitive email collisions before canonicalization; migration must fail safely rather than silently merging unrelated accounts.
- Each migrated Requester receives the approved local initial credential, stored only as a secure hash, with `mustChangePassword = true`.
- Existing Ticket `requestedPriority` is preserved; `itPriority` is initialized from it.
- Existing Tickets remain valid with `ticketOwnerId = null` unless the migration/seed deliberately assigns realistic eligible owners without changing requester ownership.
- Existing Attachment rows/files remain intact.

### Required seed data

Seed is idempotent and safe to run repeatedly and includes at least:

- four active Requester accounts and one inactive Requester account;
- three active IT Staff accounts and one inactive IT Staff account;
- one active Administrator account;
- realistic Tickets distributed across Requesters, statuses, Requested/IT priorities, and assigned/unassigned ownership; and
- example Public Comments and Internal Notes containing no sensitive information.

Seeded credentials are clearly documented as local-development/testing credentials only. Real personal passwords or secrets are never committed. Required baseline counts apply to a clean seed. After users or Tickets have been mutated, rerunning seed must preserve existing mutable account and workflow state according to BR-75 rather than forcing records back to their original demo values.

## 8. API Contract

The exact REST paths, shapes, validation, authorization, cookie behavior, query contract, concurrency behavior, and safe errors are defined in [api-spec.md](./api-spec.md). Required capability groups are:

| Capability | Method/path summary |
|---|---|
| Login / current user / password change / logout | `/api/auth/*` |
| Authenticated Requester Tickets / Attachments | existing Lab 2 paths without `requesterId` authority |
| Public Comments / Requester resolution indication | `/api/tickets/:id/*` |
| Staff Queue / Detail / owner / IT Priority / status | `/api/staff/*` |
| Internal Notes | `/api/staff/tickets/:id/internal-notes` |
| Administrator users / initial password | `/api/admin/users*` |
| Reference data | `/api/categories`, `/api/related-systems` |

All protected operations use backend authentication/authorization. Resource existence is intentionally hidden with `404` where revealing another Requester’s protected Ticket/Attachment would leak information.

## 9. Acceptance Criteria

- **AC-01 Authentication:** Given an active user with valid credentials, login establishes authenticated access and returns the safe current user. Invalid, inactive, or locked account attempts fail safely without exposing unnecessary account state.
- **AC-02 Mandatory Password Change:** Given a user with `mustChangePassword = true`, normal application screens/APIs remain unavailable until a valid password change succeeds; invalid change attempts do not partially alter credential state.
- **AC-03 Session Lifecycle:** Current-user retrieval, absolute 8-hour expiry, logout invalidation, inactive-user rejection, password-change invalidation, and Administrator initial-password-reset invalidation work according to the contract.
- **AC-04 Requester Identity Security:** Requester Ticket/Attachment operations derive ownership from authenticated identity. Client-supplied requester identity cannot access another Requester’s data, and unauthorized protected resources fail safely.
- **AC-05 Lab 2 Requester Regression:** Authenticated Requesters can still Create Ticket, use My Tickets search/filter/sort/pagination, open owned Ticket Detail, and use permitted Attachments with the documented Lab 2 behavior, while Requester Selection/Change Requester are removed.
- **AC-06 Requester Lab 3 Features:** An authenticated Requester can see Assigned To/Unassigned in owned Ticket Detail, read/add Public Comments, and indicate Problem Appears Resolved without changing formal Current Status only in `NEW`, `OPEN`, `IN_PROGRESS`, `WAITING_FOR_REQUESTER`, or `REOPENED`; `RESOLVED`, `CLOSED`, and `CANCELLED` reject the indication without mutating existing state.
- **AC-07 Authorization:** Direct API requests from Requester, IT Staff, or Administrator are allowed/denied according to the authorization matrix; UI visibility is not relied on as enforcement.
- **AC-08 Staff Queue:** Authorized IT Staff/Administrator can retrieve and use the shared queue with the documented search, filters, sorting, pagination, ownership, priorities, status data, and safe loading/empty/no-results/failure behavior.
- **AC-09 Ownership:** Claim/assign/reassign accepts only eligible active IT Staff/Administrator owners. First assignment changes `NEW → OPEN` atomically. Concurrent Claim has one winner and stale ownership mutation is rejected.
- **AC-10 IT Priority:** IT Priority initializes from Requested Priority, can be changed only by authorized Staff/Admin, respects stale-write protection, and never overwrites Requested Priority.
- **AC-11 Status Workflow:** The backend accepts every listed permitted transition and rejects every unlisted/forbidden transition, including direct `NEW → OPEN` through the generic status endpoint. Reopen owner invariants and Requester-resolution indication clearing are enforced atomically.
- **AC-12 Communication:** Public Comments and Internal Notes are append-only, backend-authored/timestamped, trimmed plain text. Public Comments allow 1–200 characters; Internal Notes allow 1–2,000 characters. Internal Notes are accessible only to IT Staff/Administrator and never leak through Requester responses.
- **AC-13 Administrator User Management:** Administrator can list users, search by name/email, optionally filter by role, refresh, create, and edit Users with exactly one role, case-insensitive unique email, activation state, and approved initial-password behavior; Status remains visible but is not a list filter; desktop rows/mobile cards open Edit User directly; non-Administrators are forbidden.
- **AC-14 Administrator Safety:** Self-deactivation, removal/deactivation/role-away of the last active Administrator, and deactivation/role-away of a User still owning non-terminal Tickets are rejected atomically.
- **AC-15 Initial Password Reset:** Administrator setting a new initial password applies password policy, sets mandatory change, resets login-lock state, revokes target sessions, never returns the password/hash, and requires the target to change password after next login.
- **AC-16 Migration and Seed:** Lab 2 Requesters evolve into Users while existing Ticket/Attachment/reference-data relationships remain valid; IT Priority migration and local initial credentials are correct; a clean seed creates the required Lab 3 baseline without duplication, and rerunning seed preserves mutable account/Ticket state already changed after seeding.
- **AC-17 UI/UX:** Login, Change Password, Requester, Staff, and Administrator screens extend the Lab 2 Zen Green design language; desktop/tablet/mobile layouts, loading/saving/success/validation/empty/no-results/forbidden/failure states, and keyboard/focus/accessibility behavior match ui-spec.md.
- **AC-18 Safe Failure and Security:** Strict input validation, protected-resource hiding, safe error envelopes, ORM/parameterized/allow-listed query behavior, plain-text user content, secure cookie/origin/CORS behavior, secret minimization, and direct security-negative tests satisfy the approved contract.

## 10. Product Definition of Done

### Product completion

- [ ] `specification.md`, `api-spec.md`, `ui-spec.md`, and `tests.md` are internally consistent and contain no unresolved placeholder/TBD affecting implementation.
- [ ] All approved FR/BR/AC behavior required for the released Lab 3 increment is implemented; every AC has traceable automated evidence.
- [ ] Authentication covers valid/invalid login, inactive/locked behavior, mandatory first-password change, current user, logout, and 8-hour expiry.
- [ ] Passwords are never plaintext and use the approved slow salted password hash.
- [ ] Every protected backend endpoint enforces role/ownership/action/state authorization; direct unauthorized API tests exist.
- [ ] Requester ownership derives only from authenticated identity; Lab 2 Requester Ticket/Attachment regression remains green after migration and selector removal.
- [ ] Staff Queue/Detail, ownership, IT Priority, status workflow, Public Comments, Internal Notes, and Requester resolution indication match the contract.
- [ ] Administrator User Management and safety rules match the contract; no user deletion or extra administration scope is introduced.
- [ ] Internal Notes never appear in Requester API responses.
- [ ] Input/query/body validation, safe errors, plain-text rendering, SQL-injection-safe query construction, and sensitive-response minimization are verified.
- [ ] Session/database secrets come from environment configuration; `.env` is not committed and `.env.example` contains placeholders only.
- [ ] Migration preserves existing Lab 2 data and required idempotent seed data is present.
- [ ] Required unit, API/integration, security/authorization, migration/regression, UI, accessibility, responsive/visual, and E2E tests pass on the exact release tree; skipped/disabled required tests are not accepted.
- [ ] Zen Green continuity, responsive behavior, and accessibility are verified against ui-spec.md.

### Course delivery / repository workflow

- [ ] Lab 3 work uses GitHub Issues, feature branches, `lab3-staging`, peer-reviewed PRs, and the agreed Kanban states.
- [ ] No implementation Issue moves to Started before this engineering contract is peer-reviewed and merged to `lab3-staging`.
- [ ] Author does not self-merge feature or release PRs.
- [ ] Review comments are resolved with truthful evidence; exact-head approval/CI rules are respected.
- [ ] `reviewer.md`, `ai-use.md`, README, tests evidence, screenshots, and final submission material are synchronized only when corresponding evidence actually exists.

## 11. Assumptions / Decisions

1. **Authorization model:** RBAC is combined with object ownership and workflow-state rules. Subject + action + object/state determines authorization. Administrator’s Staff Ticket permissions are an explicit TokTickIT matrix decision rather than inheritance by convention.
2. **Session architecture:** server-side opaque PostgreSQL sessions were chosen over JWT because immediate logout, password-change invalidation, Administrator reset invalidation, and user deactivation are central Lab 3 requirements. The browser receives only an opaque HttpOnly cookie; the database stores a hash of that token.
3. **Password storage:** use Argon2id with a unique random salt and PHC-encoded parameters. The implementation baseline is `m=19456` KiB, `t=2`, `p=1`, which avoids bcrypt's 72-byte input limitation while preserving the approved 8–64 Unicode-code-point password contract. This is a TokTickIT implementation choice, not a requirement that the lecture fixed to one algorithm.
4. **CSRF/CORS:** first-party browser architecture uses `SameSite=Lax`, mandatory exact approved-Origin checks on every state-changing request including Login, and strict credentialed CORS. Missing Origin, `Origin: null`, and unapproved origins fail closed. A dedicated synchronizer token is intentionally omitted for this architecture and must be reconsidered if cross-site authenticated use is introduced.
5. **Ticket Owner terminology:** Requester/Submitted By is the historical user who submitted the Ticket; Ticket Owner/Assigned To is the operational active IT Staff/Administrator owner. They are intentionally different relationships.
6. **Requester My Tickets columns:** preserve the seven-column Lab 2 table; Assigned To is shown on Requester Ticket Detail, not added to My Tickets, to avoid unnecessary table expansion.
7. **Staff Queue density:** desktop Queue uses Ticket Number, Summary, Category, Requested Priority, IT Priority, Current Status, Ticket Owner, and Last Updated. Single-line clamping and the wider Staff content area preserve readability instead of hiding required filter-corresponding data.
8. **Status semantics:** `RESOLVED` means IT believes the problem is fixed but the Ticket is not final; `CLOSED` is final completion; `REOPENED` means a previously Resolved/Closed issue is active again; `CANCELLED` means current work was intentionally discontinued and is terminal.
9. **Requester replies:** a Requester comment while `WAITING_FOR_REQUESTER` never auto-transitions status. Staff/Admin explicitly returns the Ticket to `IN_PROGRESS`.
10. **Requester resolution indication:** stored as nullable `requesterResolutionIndicatedAt`; it may be set only in `NEW`, `OPEN`, `IN_PROGRESS`, `WAITING_FOR_REQUESTER`, or `REOPENED` and never alters Current Status. Once set, the indication may remain visible if Staff later moves the Ticket to Resolved/Closed; any Reopen clears it. Staff Ticket Detail shows the indication as plain text without a checkmark glyph; Queue does not add a dedicated indication column.
11. **Communication after completion:** Comments/Notes are communication records, not status transitions. Lab 3 does not add edit/delete or attachment support to them.
12. **Status history:** no separate Status History model/API/UI is created in Lab 3. It is recorded as a future option, not hidden scope.
13. **Concurrency:** use targeted expected-value/conditional mutations for Ticket operations rather than introducing a generic row-version framework throughout the application.
14. **Timestamps:** database/API timestamps remain UTC; existing Requester-facing display continues the Lab 2 Asia/Bangkok convention.
15. **Seed credentials:** deterministic credentials are permitted only for local development/testing seed data and must be clearly marked non-production; no real personal secrets are committed.
16. **Security model:** protected assets include credentials, sessions, User accounts, Tickets, Attachments, Public Comments, Internal Notes, and database records. Attack surfaces include Login, protected APIs, uploads, query/filter/sort parameters, and Administrator screens. Primary trust boundaries are Browser → Backend API → PostgreSQL/file storage.
