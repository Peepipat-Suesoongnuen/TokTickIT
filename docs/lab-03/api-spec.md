# Lab 3 REST API Specification — TokTickIT

Companion contract to [specification.md](./specification.md), [ui-spec.md](./ui-spec.md), and [tests.md](./tests.md). Lab 2 endpoint behavior is preserved where this file does not explicitly replace it.

## 1. Common Conventions

### 1.1 Base URL and media types

- API base: `/api`
- JSON request/response bodies use `Content-Type: application/json` unless an Attachment route requires multipart/binary data.
- Business entity IDs are positive integers.
- API timestamps are ISO 8601 UTC strings, for example `2026-09-12T13:42:18.000Z`.

### 1.2 Authentication mechanism

TokTickIT uses a server-side opaque session:

1. Login validates email/password.
2. The server generates at least 32 cryptographically random bytes for the opaque session token.
3. The raw token is sent only in an HttpOnly cookie; the database stores a SHA-256 (or equivalently strong one-way) token hash, never the raw token.
4. The session has an absolute lifetime of 8 hours with no sliding extension.
5. Protected requests re-load/validate the session and current User state; browser-cached role/user state is not authorization authority.

Cookie requirements:

- name: implementation-defined stable name such as `toktickit_session`;
- `HttpOnly`;
- `SameSite=Lax`;
- `Path=/`;
- `Secure` whenever HTTPS is used; local HTTP development may omit `Secure` only for the local environment;
- expiry/max-age no later than the server-side absolute 8-hour expiration.

The session token must not be stored in browser `localStorage` or `sessionStorage`.

### 1.3 Password storage and login protection

- Passwords use Argon2id with a unique library-generated random salt and PHC-encoded parameters. The Lab 3 baseline is `m=19456` KiB, `t=2`, `p=1`; implementations may raise these costs after performance verification but must not silently lower them.
- Passwords are 8–64 Unicode code points, require uppercase + lowercase + special character, and a changed password must differ from the current password. Password input is not trimmed, Unicode-normalized, or silently truncated before hashing; multibyte UTF-8 passwords within the character limit remain valid.
- Existing-account failed-password counter locks the account after 5 consecutive incorrect-password attempts for 15 minutes.
- Successful authentication before the fifth failure resets the counter.
- Lock expiry is automatic; correct credentials while locked still fail.
- Setting a new initial password resets failed-attempt/lock state.
- IP-level rate limiting is also required; its numeric threshold/window is deployment configuration and is covered by tests through configurable limits rather than a business-rule constant.

### 1.4 Error envelope

Default:

```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "One or more fields are invalid."
  }
}
```

Field-level validation may add the Lab 2-compatible top-level `fieldErrors`:

```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "One or more fields are invalid."
  },
  "fieldErrors": {
    "email": "Email is required."
  }
}
```

No response exposes stack traces, SQL/Prisma errors, password/hash values, raw session tokens, token hashes, failed-login counters, lock timestamps, or unrelated protected-object details.

### 1.5 HTTP status semantics

| Status | Meaning |
|---|---|
| `200` | successful read/update/action with response body |
| `201` | resource created |
| `204` | successful action with no body |
| `400` | malformed/invalid/unknown request input |
| `401` | no valid authentication: absent/invalid/expired/inactive session |
| `403` | forbidden role/action, `PASSWORD_CHANGE_REQUIRED`, or failed state-changing request Origin policy |
| `404` | resource absent or deliberately hidden protected resource |
| `409` | valid request conflicts with current business/resource state or stale expected state |
| `413` | Attachment exceeds size limit |
| `415` | unsupported Attachment media/signature |
| `429` | configured rate limit exceeded |
| `500` | unexpected safe server failure |

### 1.6 Strict request contract

- Unknown query parameter → `400`.
- Duplicate query parameter → `400`.
- Invalid enum/type/ID/range → `400`.
- Unknown JSON body field → `400`.
- Query-structure fields such as `sort` and `order` are allow-listed.
- JSON duplicate-key detection is not a separate Lab 3 requirement beyond the behavior of the configured JSON parser.

### 1.7 Authentication/authorization order

Protected requests apply the relevant checks before mutation/response:

1. session exists and is not expired;
2. User exists and is active;
3. mandatory-password-change gate;
4. role capability;
5. resource existence/visibility and ownership;
6. workflow/business-state validation;
7. expected-state concurrency validation where required.

For Requester-owned Ticket/Attachment resources, “other user’s resource” and “resource does not exist” use the same safe `404` response.

### 1.8 Mandatory-password gate

When `mustChangePassword = true`, the user may call only:

- `GET /api/auth/me`;
- `POST /api/auth/change-password`;
- `POST /api/auth/logout`;
- strictly necessary login/authentication behavior.

Other protected application endpoints return:

```http
403 Forbidden
```

```json
{
  "error": {
    "code": "PASSWORD_CHANGE_REQUIRED",
    "message": "You must change your password before continuing."
  }
}
```

### 1.9 CSRF and CORS

- Credentialed CORS allows only configured TokTickIT application origin(s), never `*`; an approved origin receives the exact matching `Access-Control-Allow-Origin` and credential support.
- Every state-changing request (`POST`, `PUT`, `PATCH`, `DELETE`) requires an `Origin` header that exactly matches an approved application origin. This includes `POST /api/auth/login`, password change, logout, Ticket/Attachment mutations, Staff mutations, and Administrator mutations.
- Missing `Origin`, `Origin: null`, or an unapproved Origin is rejected before mutation and before account/resource-specific processing with `403 ORIGIN_NOT_ALLOWED` and the standard safe error envelope. These rejected origins do not receive credentialed CORS authorization.
- Safe read methods (`GET`, `HEAD`) do not require Origin for CSRF validation, though ordinary CORS rules still govern cross-origin browser reads. Approved `OPTIONS` preflight may advertise only the configured origin/methods/headers and never performs authentication or business mutation.
- `SameSite=Lax` is required on the session cookie as defense in depth.
- A separate synchronizer CSRF token is not required for this first-party architecture; this decision must be revisited if cross-site authenticated requests become a requirement.

## 2. Safe User Representation

Where the authenticated/current user is returned:

```json
{
  "id": 12,
  "name": "Alice Example",
  "email": "alice@example.com",
  "role": "REQUESTER",
  "active": true,
  "mustChangePassword": false
}
```

The API field is named `active`; it maps to the persisted User activation field (`isActive` in the data model). The wire name is intentionally stable even if the ORM field name differs.

Allowed roles:

```text
REQUESTER
IT_STAFF
ADMINISTRATOR
```

## 3. Authentication APIs

### 3.1 `POST /api/auth/login`

No existing session is required.

Request:

```json
{
  "email": "alice@example.com",
  "password": "Example!Pass"
}
```

Rules:

- email is trimmed and canonicalized case-insensitively;
- account-specific failures remain generic;
- existing-account lock rules apply;
- inactive users cannot authenticate;
- a successful login creates a fresh 8-hour session and resets failed-attempt state;
- `mustChangePassword = true` does not make login itself fail; it gates normal APIs after login.

Success `200`:

```json
{
  "user": {
    "id": 12,
    "name": "Alice Example",
    "email": "alice@example.com",
    "role": "REQUESTER",
    "active": true,
    "mustChangePassword": true
  }
}
```

Account-specific failure `401`:

```json
{
  "error": {
    "code": "INVALID_CREDENTIALS",
    "message": "Invalid email or password."
  }
}
```

Configured IP limit `429`:

```json
{
  "error": {
    "code": "TOO_MANY_ATTEMPTS",
    "message": "Too many login attempts. Please try again later."
  }
}
```

### 3.2 `GET /api/auth/me`

Returns `200` with `{ "user": <safe user> }`.

- Allowed while `mustChangePassword = true`.
- Invalid/expired/inactive authentication → `401`.
- Does not return security counters, lock state, password metadata, or session token data.

### 3.3 `POST /api/auth/logout`

Idempotent.

Success `204`:

- revoke current server-side session if present;
- clear session cookie;
- repeated logout remains harmless.

### 3.4 `POST /api/auth/change-password`

Allowed for an authenticated user including `mustChangePassword = true`.

Request:

```json
{
  "currentPassword": "Initial!Pass",
  "newPassword": "MyNew!Pass"
}
```

The UI confirmation field is not sent to the API.

Success `200`:

- update password hash;
- set `mustChangePassword = false`;
- invalidate all existing sessions for the user;
- establish one fresh current session;
- return `{ "user": <safe user> }`.

Invalid policy → `400 VALIDATION_FAILED` + `fieldErrors.newPassword`.

Wrong current password → `400 CURRENT_PASSWORD_INVALID` without revealing stored credential details.

Any invalid attempt leaves credential/session/mandatory state unchanged.

## 4. Reference Data

### `GET /api/categories`
### `GET /api/related-systems`

Authenticated users who have passed the mandatory-password gate may retrieve active reference data required by their permitted Ticket screens. Responses remain ordered and shaped consistently with Lab 2.

`requesterId` is not accepted.

The Lab 2 Development Requester selector endpoint `/api/requesters` is not part of the normal Lab 3 UI/API contract and must not be used to establish identity.

## 5. Requester Ticket APIs — Lab 2 Continuity

Requester routes require `REQUESTER` and use `req.user.id` (conceptually) as requester ownership authority.

### 5.1 `POST /api/tickets`

Request:

```json
{
  "categoryId": 1,
  "relatedSystemId": 2,
  "summary": "Laptop cannot join campus Wi-Fi",
  "description": "The laptop repeatedly rejects the campus Wi-Fi connection after login.",
  "requestedPriority": "HIGH"
}
```

No `requesterId` is accepted.

Existing Lab 2 validation remains:

- Summary 5–120 characters after trim;
- Description 20–2,000 characters after trim;
- active Category/Related System required;
- Requested Priority one of `LOW`, `MEDIUM`, `HIGH`, `CRITICAL`.

Backend creation additionally sets:

```text
requesterId = authenticated Requester
currentStatus = NEW
ticketOwnerId = null
itPriority = requestedPriority
requesterResolutionIndicatedAt = null
```

Success `201` preserves the Lab 2 Ticket response and may include the new fields where useful.

### 5.2 `GET /api/tickets` — My Tickets

Returns only Tickets submitted by the authenticated Requester.

Supported query:

| Parameter | Values / semantics |
|---|---|
| `search` | trimmed case-insensitive partial Ticket Number OR Summary; Description is not searched |
| `categoryId` | active Category positive integer |
| `requestedPriority` | `LOW\|MEDIUM\|HIGH\|CRITICAL` |
| `currentStatus` | any of the eight Lab 3 statuses |
| `sort` | `ticketNumber\|ticketDate\|requestedPriority\|updatedAt` |
| `order` | `asc\|desc` |
| `page` | integer ≥1; default 1 |
| `pageSize` | `10\|20\|50`; default 10 |

Default: `updatedAt DESC`, then `id DESC`.

Page beyond total pages returns `200` with empty `data` and valid `meta`, preserving Lab 2 behavior.

Unknown `requesterId` or any other unknown query field → `400`.

List response preserves Lab 2 `data` + `meta` shape; every item includes valid ISO UTC `ticketDate` and the expanded status value.

### 5.3 `GET /api/tickets/:id`

Own Ticket only; missing/not-owned → safe `404`.

Response extends Lab 2 detail with:

```json
{
  "ticketOwner": {
    "id": 17,
    "name": "Bob Staff"
  },
  "itPriority": "HIGH",
  "requesterResolutionIndicatedAt": null
}
```

`ticketOwner` may be `null`. Requester detail does not expose owner email or Internal Notes.

## 6. Requester Attachment APIs

Preserve Lab 2 route names and Attachment behavior but remove client requester identity from authorization:

```text
POST /api/tickets/:id/attachments
GET  /api/attachments/:id
GET  /api/attachments/:id/download
POST /api/attachments/:id/remove
```

Rules preserved from Lab 2:

- `POST /api/tickets/:id/attachments` and `POST /api/attachments/:id/remove` remain Requester-owned mutation routes; the parent Ticket must belong to the authenticated Requester;
- `GET /api/attachments/:id` and `GET /api/attachments/:id/download` are authorized by Ticket visibility: Requester may access own Ticket Attachments; IT Staff/Admin may access Attachments for a Ticket they are authorized to open through Staff Detail;
- allowed JPG/JPEG, PNG, WEBP, PDF with existing extension/MIME/signature protections;
- maximum 5 MB per file;
- maximum 5 active Attachments per Ticket;
- soft removal only;
- removal reason required/non-blank;
- removed Attachment metadata remains but download is blocked;
- wrong-owner and hidden Attachment access return safe `404`.

Any former `requesterId` query/body field is rejected as unknown input.

## 7. Public Comments and Requester Resolution Indication

### 7.1 `GET /api/tickets/:id/comments`

Authorization:

- Requester: own Ticket only;
- IT Staff/Admin: authorized Ticket access under the staff operation matrix.

Response:

```json
{
  "data": [
    {
      "id": 81,
      "author": {
        "id": 5,
        "name": "Alice Example",
        "role": "REQUESTER"
      },
      "content": "The problem still happens after restart.",
      "createdAt": "2026-09-12T12:30:00.000Z"
    }
  ]
}
```

Order: `createdAt ASC`, then `id ASC`.

No pagination is required for Lab 3 comments.

### 7.2 `POST /api/tickets/:id/comments`

Request:

```json
{
  "content": "The problem still happens after restart."
}
```

Only `content` is accepted. Backend supplies Ticket, author, and creation time.

Validation:

- trim outer whitespace;
- 1–200 characters after trim;
- stored/transmitted as plain text.

Success `201` returns the created comment.

Posting a Public Comment does not automatically change Ticket status, including while Waiting/Resolved/Closed/Cancelled.

### 7.3 `POST /api/tickets/:id/problem-appears-resolved`

Requester only; own Ticket only.

Allowed Current Status values are `NEW`, `OPEN`, `IN_PROGRESS`, `WAITING_FOR_REQUESTER`, and `REOPENED`. `RESOLVED`, `CLOSED`, and `CANCELLED` reject the action with `409 INVALID_TICKET_STATE`; rejection does not change Current Status or an existing indication timestamp.

No request body.

Success `200` returns the updated indication field or safe Ticket summary:

```json
{
  "requesterResolutionIndicatedAt": "2026-09-12T12:40:00.000Z"
}
```

The endpoint does not mutate `currentStatus`.

Within an allowed Current Status, the operation is idempotent while the indication is already present: a repeated call returns the existing indication timestamp rather than creating a second event or changing Ticket status. If the Ticket has since moved to `RESOLVED`, `CLOSED`, or `CANCELLED`, a repeated request is rejected by the status precondition and leaves the stored indication unchanged. A later Reopen clears the indication according to the status contract.

## 8. IT Staff Queue

Staff routes authorize `IT_STAFF` and, by explicit project matrix, `ADMINISTRATOR`.

### `GET /api/staff/tickets`

Requester → `403` before Ticket-specific data is exposed.

Supported query:

| Parameter | Values / semantics |
|---|---|
| `search` | case-insensitive partial Ticket Number, Summary, Requester name, or Requester email; Description is not searched |
| `categoryId` | active Category positive integer |
| `requestedPriority` | four priority values |
| `itPriority` | four priority values |
| `currentStatus` | eight status values |
| `owner` | `unassigned`, `me`, or positive User ID |
| `sort` | `updatedAt\|ticketDate\|ticketNumber\|requestedPriority\|itPriority` |
| `order` | `asc\|desc` |
| `page` | integer ≥1; default 1 |
| `pageSize` | `10\|20\|50`; default 10 |

For `owner=<id>`, filtering may target a historical owner User even if that User is no longer currently eligible; assignment eligibility is enforced only by assignment operations. Nonexistent owner IDs are invalid input.

Default ordering:

```text
itPriority DESC by explicit LOW < MEDIUM < HIGH < CRITICAL rank
updatedAt DESC
id DESC
```

Response row:

```json
{
  "id": 101,
  "ticketNumber": "2609-0101",
  "ticketDate": "2026-09-12T08:00:00.000Z",
  "summary": "Cannot connect to VPN",
  "requester": { "id": 5, "name": "Alice Example" },
  "category": { "id": 3, "name": "Network" },
  "requestedPriority": "HIGH",
  "itPriority": "CRITICAL",
  "currentStatus": "IN_PROGRESS",
  "ticketOwner": { "id": 17, "name": "Bob Staff" },
  "requesterResolutionIndicatedAt": null,
  "updatedAt": "2026-09-12T12:00:00.000Z"
}
```

`ticketOwner` may be `null`. Standard Lab 2-style `meta` pagination object is returned.

## 9. Staff Ticket Detail and Ownership

### 9.1 `GET /api/staff/tickets/:id`

Staff/Admin may open a shared Ticket without owning it first.

Response includes Ticket identifiers/timestamps, Requester `id/name/email`, Category, Related System, Summary, Description, Requested Priority, IT Priority, Current Status, Ticket Owner `id/name/role` or null, Requester-resolution indication, Attachments, and relevant timestamps. Public Comments/Internal Notes are retrieved through their own endpoints.

### 9.2 `GET /api/staff/ticket-owners`

Returns active currently owner-eligible Users only:

```json
{
  "data": [
    { "id": 17, "name": "Bob Staff", "role": "IT_STAFF" },
    { "id": 22, "name": "Admin One", "role": "ADMINISTRATOR" }
  ]
}
```

Used for Claim/Assign/Reassign owner pickers. Requesters and inactive users are excluded.

### 9.3 `POST /api/staff/tickets/:id/claim`

No body.

Precondition: Ticket owner remains `null` at mutation time.

Atomic result:

- `ticketOwnerId = authenticated Staff/Admin`;
- the authenticated claimant must still be active and owner-eligible at commit time under the shared owner-integrity concurrency protocol; if a concurrent Administrator update makes the claimant ineligible first, Claim returns `409 OWNER_NOT_ELIGIBLE` without changing owner/status;
- claiming is valid only for an unassigned `NEW` Ticket;
- `currentStatus = OPEN` in the same transaction.

Concurrent claim: exactly one succeeds; loser → `409 TICKET_ALREADY_ASSIGNED`.

### 9.4 `PATCH /api/staff/tickets/:id/owner`

Request:

```json
{
  "ownerId": 23,
  "expectedOwnerId": 17
}
```

For currently unassigned state, `expectedOwnerId` is `null`.

Rules:

- new owner must be active IT Staff/Admin; an already-ineligible target returns `409 OWNER_NOT_ELIGIBLE`;
- owner eligibility is revalidated under the shared owner-integrity concurrency protocol at commit time, not only when the request first reads the User; if the target becomes inactive or changes to an ineligible role before the owner mutation can commit, the mutation returns `409 OWNER_NOT_ELIGIBLE` and does not change Ticket ownership/status;
- first assignment on `NEW` atomically sets `OPEN`;
- reassign after first assignment does not change status;
- same-owner update is idempotent if expected state matches;
- no general Unassign action exists in Lab 3;
- standalone owner mutation on `CLOSED` or `CANCELLED` is rejected;
- stale expected owner → `409 TICKET_STATE_CHANGED`.

## 10. IT Priority

### `PATCH /api/staff/tickets/:id/it-priority`

Request:

```json
{
  "itPriority": "HIGH",
  "expectedItPriority": "MEDIUM"
}
```

Allowed values: `LOW`, `MEDIUM`, `HIGH`, `CRITICAL`.

- Staff/Admin only;
- Requested Priority is never changed by this endpoint;
- standalone IT Priority updates are allowed for non-terminal operational states and rejected when the Ticket is `CLOSED` or `CANCELLED`;
- stale expected value → `409 TICKET_STATE_CHANGED`.

## 11. Ticket Status

### `PATCH /api/staff/tickets/:id/status`

Standard request:

```json
{
  "status": "IN_PROGRESS",
  "expectedCurrentStatus": "OPEN"
}
```

For `CLOSED → REOPENED` when the historical owner is no longer active/eligible:

```json
{
  "status": "REOPENED",
  "expectedCurrentStatus": "CLOSED",
  "ownerId": 23
}
```

Processing order conceptually:

1. authenticate/authorize Staff/Admin;
2. find Ticket;
3. compare expected current status;
4. validate listed transition;
5. enforce owner eligibility required by the resulting active state, and when this transition supplies/replaces an owner, revalidate that target under the shared owner-integrity concurrency protocol at commit time;
6. atomically update status and any required owner/indication changes.

Rules:

- stale expected status → `409 TICKET_STATE_CHANGED`;
- valid enum but unlisted transition → `409 INVALID_STATUS_TRANSITION`;
- `NEW → OPEN` cannot use this endpoint; it occurs only through first Claim/Assign;
- `OPEN`, `IN_PROGRESS`, `WAITING_FOR_REQUESTER`, `RESOLVED`, and `REOPENED` require a non-null active IT Staff/Admin owner;
- `NEW` may be unassigned;
- `CANCELLED` may retain/null historical owner and is terminal;
- `CLOSED` retains historical owner;
- `RESOLVED → REOPENED` normally keeps its still-eligible owner because owner-integrity rules apply while Resolved;
- `CLOSED → REOPENED` requires a replacement `ownerId` in the same request if historical owner is no longer eligible; that replacement owner must still be active and owner-eligible at commit time under the shared owner-integrity concurrency protocol, otherwise the status mutation returns `409 OWNER_NOT_ELIGIBLE` without reopening the Ticket;
- any transition to `REOPENED` clears `requesterResolutionIndicatedAt` atomically.

Permitted matrix is authoritative in `specification.md` §5.

`CLOSED` and `CANCELLED` confirmations are UI requirements only; there is no `confirmed` API field.

## 12. Internal Notes

### `GET /api/staff/tickets/:id/internal-notes`
### `POST /api/staff/tickets/:id/internal-notes`

Authorization: IT Staff/Admin only. Requester is rejected with `403` at the staff-route role boundary before note content is queried/exposed.

GET response:

```json
{
  "data": [
    {
      "id": 21,
      "author": {
        "id": 17,
        "name": "Bob Staff",
        "role": "IT_STAFF"
      },
      "content": "Device logs show repeated authentication failures.",
      "createdAt": "2026-09-12T11:00:00.000Z"
    }
  ]
}
```

Order `createdAt ASC`, then `id ASC`; no Lab 3 pagination requirement.

POST request accepts only `{ "content": "..." }`, trims outer whitespace, rejects empty/whitespace-only input, stores plain text only, enforces 1–2,000 characters after trim, and returns `201`.

No edit/delete or note-by-ID mutation endpoint exists.

Requester Ticket Detail and Public Comment responses never include an `internalNotes` property, even as an empty array.

Adding a note does not automatically change Ticket status.

## 13. Administrator User Management

All `/api/admin/*` routes require `ADMINISTRATOR`. IT Staff/Requester → `403`.

### 13.1 `GET /api/admin/users`

Supported optional query:

| Parameter | Semantics |
|---|---|
| `search` | trimmed case-insensitive partial User name OR email |
| `role` | `REQUESTER\|IT_STAFF\|ADMINISTRATOR`; optional |

`active`/Status is intentionally not a list query filter in Lab 3. Under the strict request contract, supplying `active` or another unlisted query parameter returns `400`. Status remains part of each returned User row and remains editable through the User update API. Advanced mandatory pagination/multi-column sorting and multiple simultaneous list filters are intentionally out of scope.

Response:

```json
{
  "data": [
    {
      "id": 12,
      "name": "Alice Example",
      "email": "alice@example.com",
      "role": "REQUESTER",
      "active": true,
      "mustChangePassword": false,
      "createdAt": "2026-09-01T08:00:00.000Z"
    }
  ]
}
```

No password/security-counter/session fields are returned.

### 13.2 `POST /api/admin/users`

Request:

```json
{
  "name": "Bob Example",
  "email": "bob@example.com",
  "role": "IT_STAFF",
  "active": true,
  "initialPassword": "Example!Pass"
}
```

Rules:

- trim name; required length is 2–100 characters after trim;
- trim + canonicalize email; required length is 3–254 characters after trim and it must satisfy the application email-format validator;
- case-insensitive unique email;
- exactly one permitted role;
- initial password follows password policy and is hashed before persistence;
- created User has `mustChangePassword = true`.

Success `201` returns safe User management data and never echoes initial password.

Duplicate email → `409 EMAIL_ALREADY_EXISTS`.

### 13.3 `PATCH /api/admin/users/:id`

Partial request; only these fields are accepted:

```json
{
  "name": "Updated Name",
  "email": "updated@example.com",
  "role": "IT_STAFF",
  "active": true
}
```

Not accepted here: password/hash, `mustChangePassword`, login counters, lock timestamps, sessions, created timestamp.

The complete resulting User state is validated atomically before update.

Required conflicts:

- current Administrator attempts self-deactivation → `409 CANNOT_DEACTIVATE_SELF`;
- operation would leave zero active Administrators → `409 LAST_ACTIVE_ADMINISTRATOR`;
- deactivation or role-away while target owns non-terminal Tickets → `409 USER_HAS_ACTIVE_TICKETS`;
- canonical email collides → `409 EMAIL_ALREADY_EXISTS`.

The last-active-Administrator invariant must be protected transactionally against concurrent Administrator updates.

For an update that deactivates a User or changes the role away from `IT_STAFF`/`ADMINISTRATOR`, the non-terminal Ticket-owner check is also a commit-time concurrency invariant shared with every operation that can establish/change a non-terminal owner, including Claim/Assign/Reassign and Reopen owner repair. If a concurrent owner mutation establishes non-terminal ownership first, this Administrator update returns `409 USER_HAS_ACTIVE_TICKETS` without partial User changes. If the Administrator update commits first, a concurrent owner mutation targeting that User must revalidate eligibility and return `409 OWNER_NOT_ELIGIBLE`. Both requests must never commit if that would leave a non-terminal Ticket owned by an inactive User or a `REQUESTER`.

Historical requester/Ticket relationships are not rewritten when current User role changes.

### 13.4 `POST /api/admin/users/:id/initial-password`

Request:

```json
{
  "initialPassword": "NewExample!Pass"
}
```

Atomic success `204`:

- validate/hash password;
- set `mustChangePassword = true`;
- `failedLoginAttempts = 0`;
- `lockedUntil = null`;
- invalidate all sessions of target User.

No password/hash is returned.

This is not a standalone Unlock User feature; clearing lock state is part of the approved initial-password reset operation.

## 14. Plain-Text and Injection-Safe Data Handling

- Summary, Description, Public Comment, Internal Note, and Attachment removal reason are user-authored data and are rendered as text, not executable HTML.
- The API does not rely on HTML stripping as authorization/XSS protection; it stores valid text and the UI uses safe text rendering.
- Prisma/ORM or parameterized queries are used for client-derived values.
- Unsafe raw SQL/string concatenation with client input is forbidden.
- Sort/filter fields that affect query structure are selected from explicit allow-lists.

## 15. Atomicity and Concurrency Summary

| Operation | Required atomic/conditional behavior |
|---|---|
| First Claim/Assign | owner update + `NEW → OPEN` together; owner must still be null/expected; target owner eligibility revalidated at commit |
| Reassign | `expectedOwnerId` must match; target owner eligibility revalidated at commit |
| IT Priority | `expectedItPriority` must match |
| Status | `expectedCurrentStatus` must match; transition + owner/indication repair together; if the transition establishes/replaces a non-terminal owner, target eligibility is revalidated at commit |
| Admin User update | evaluate complete resulting state + last-admin/owner invariants + update together; deactivate/demote revalidates non-terminal ownership at commit |
| Set initial password | credential + mandatory state + lock reset + session invalidation together |
| Change password | credential + mandatory state + old-session invalidation + fresh-session establishment as one logical success |

Claim/Assign/Reassign/Reopen owner repair and Administrator deactivate/demote operations that target the same User participate in one concurrency-safe owner-integrity protocol. The implementation may use row-level locking, an appropriate serializable/transaction isolation strategy, conditional writes with revalidation/retry, or an equivalent mechanism; the required observable behavior is that both conflicting operations cannot commit an invalid owner state. Expected concurrency conflicts are surfaced as safe `409` responses rather than raw database/serialization failures.

If the owner mutation loses because its target User is no longer eligible:

```http
409 Conflict
```

```json
{
  "error": {
    "code": "OWNER_NOT_ELIGIBLE",
    "message": "The selected ticket owner is no longer eligible. Refresh and try again."
  }
}
```

Stale Ticket mutation response:

```http
409 Conflict
```

```json
{
  "error": {
    "code": "TICKET_STATE_CHANGED",
    "message": "The ticket has changed. Refresh and try again."
  }
}
```
