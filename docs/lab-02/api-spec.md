# Lab 2 API Specification — TokTickIT Requester API

Engineering contract companion to [specification.md](./specification.md) Section 8. Every rule referenced as BR-xx / FR-xx is defined there.

## 1. Conventions

- **Base URL**: `/api`
- **Content type**: `application/json`, except attachment upload (`multipart/form-data`) and download (binary stream).
- **Requester context transport** (BR-03, Assumption 6): requester-scoped endpoints require the selected Development Requester identity explicitly:
  - `GET` endpoints → `requesterId` query parameter (required).
  - `POST /api/tickets` → `requesterId` field in the JSON body.
  - Attachment endpoints → `requesterId` query parameter.
- **Timestamps**: serialized ISO 8601 UTC in API responses; display formatting to Asia/Bangkok is a UI concern (Assumption 3).
- **Ownership enforcement** (BR-09): if the requested resource does not exist **or exists but does not belong to the selected requester**, the API responds **404 Not Found** — existence of another requester's resource is never revealed.
- **Strict query contract** (BR-20): unknown parameter names → 400; known names with invalid values → 400.

## 2. Common Error Envelope

```json
// Validation failure (400)
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "One or more fields are invalid."
  },
  "fieldErrors": {
    "summary": "Summary must contain 5–120 characters."
  }
}
```

```json
// Missing or not-owned resource (404) — safe response
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Resource not found."
  }
}
```

```json
// Unexpected server failure (500) — safe, no internals
{
  "error": {
    "code": "INTERNAL_ERROR",
    "message": "An unexpected error occurred. Please try again."
  }
}
```

## 3. Status Code Summary

| Status | Use |
|---|---|
| 200 | Successful retrieval or removal |
| 201 | Ticket created; Attachment uploaded |
| 400 | Invalid input: body validation failure, unknown/invalid query parameters, removal without reason |
| 404 | Resource missing **or** ownership mismatch (safe response, BR-09) |
| 409 | Conflict: active-attachment limit reached; attachment already removed |
| 413 | Upload exceeds 5 MB per file |
| 415 | Uploaded file type not in JPG/JPEG, PNG, WEBP, PDF |
| 500 | Unexpected server error (safe generic message) |

## 4. Reference Data Endpoints

### 4.1 GET /api/categories
Active Categories for classification dropdowns.

**Query**: `requesterId` (required, positive integer)

**200 Response**
```json
[
  { "id": 1, "name": "Account and Access" },
  { "id": 2, "name": "Hardware" },
  { "id": 3, "name": "Software" },
  { "id": 4, "name": "Network" }
]
```
Ordered by `name ASC`. Only `isActive = true`.

**Errors**: 400 invalid `requesterId`; 500 safe.

### 4.2 GET /api/related-systems
Active Related Systems. Same contract as 4.1; ordered by `name ASC`.

### 4.3 GET /api/requesters
Active Development Requesters for the selector screen.

**Query**: `requesterId` is **not required** here (this endpoint powers selection itself).

**200 Response**
```json
[
  { "id": 1, "name": "Anucha Wongprecha", "email": "anucha.w@example.com" },
  { "id": 2, "name": "Busaba Srisawat", "email": "busaba.s@example.com" }
]
```
Only active requesters (BR-05); ordered by `name ASC`. Empty array `[]` when none exist (UI shows empty state).

## 5. Ticket Endpoints

### 5.1 POST /api/tickets
Create one validated Ticket for the selected Development Requester (FR-04/05).

**Body**
```json
{
  "requesterId": 1,
  "categoryId": 2,
  "relatedSystemId": 3,
  "summary": "Laptop battery drains quickly",
  "description": "Battery drops from 100% to 20% within one hour of normal office use.",
  "requestedPriority": "MEDIUM"
}
```

Initial attachments are uploaded after Ticket creation via Section 6.1 (partial-failure behavior per BR-18).

**Validation rules** (frontend mirrors these, BR-10/11)
| Field | Rule | Failure |
|---|---|---|
| requesterId | must reference an existing **active** requester | 400 |
| categoryId | must reference an **active** category (BR-11a) | 400 |
| relatedSystemId | must reference an **active** related system (BR-11a) | 400 |
| summary | required; 5–120 chars after trimming | 400 + fieldError |
| description | required; 20–2,000 chars after trimming | 400 + fieldError |
| requestedPriority | one of `LOW \| MEDIUM \| HIGH \| CRITICAL` | 400 + fieldError |

Input strings are trimmed before persistence and length checks.

**201 Response** — saved values come from the database (AC-01)
```json
{
  "id": 42,
  "ticketNumber": "2608-0007",
  "ticketDate": "2026-08-25T06:30:00.000Z",
  "currentStatus": "NEW",
  "requestedPriority": "MEDIUM",
  "summary": "Laptop battery drains quickly",
  "description": "Battery drops from 100% to 20% within one hour of normal office use.",
  "category": { "id": 2, "name": "Hardware" },
  "relatedSystem": { "id": 3, "name": "Corporate Laptop" },
  "requester": { "id": 1, "name": "Anucha Wongprecha" },
  "attachments": []
}
```
Ticket Number format `{YY}{MM}-{0001..9999}`, monthly reset, generated inside the creation transaction; monthly exhaustion fails safely with 500 safe message (Assumption 2). Ticket Date stored UTC (BR-07).

### 5.2 GET /api/tickets
Paginated list of the selected requester's own Tickets (FR-07, BR-19).

**Query parameters**

| Name | Rules |
|---|---|
| `requesterId` | required; positive integer |
| `search` | optional string; **case-insensitive partial match on `ticketNumber` OR `summary`** (BR-19). Description is not searched. The value is trimmed before matching; a value that is empty after trimming is invalid → 400 |
| `categoryId` | optional filter; must reference an existing **active** category; inactive or unknown ids → 400 |
| `requestedPriority` | optional filter; one of `LOW \| MEDIUM \| HIGH \| CRITICAL` |
| `sort` | optional; one of `updatedAt` (default), `ticketDate`, `ticketNumber`, `requestedPriority` |
| `order` | optional; `asc` \| `desc` (default `desc`) |
| `page` | optional; integer ≥ 1 (default 1) |
| `pageSize` | optional; one of `10` (default), `20`, `50` |

Current Status filtering is **not offered in Lab 2** — final decision: deferred (all Lab 2 tickets are `NEW`; status filters arrive with the status workflow in a later lab). Unknown parameter names → 400; invalid values → 400 (strict contract, BR-20).

A `page` value greater than `totalPages` is **not** an error: the API returns 200 with `"data": []` and valid pagination metadata.

**Default sort**: `updatedAt DESC`, secondary `id DESC` (BR-21). `requestedPriority` sorts by severity rank — ASC: `LOW, MEDIUM, HIGH, CRITICAL`; DESC: `CRITICAL, HIGH, MEDIUM, LOW`. `ticketNumber` uses the fixed-width `{YY}{MM}-{4 digits}` format, so database string ordering matches chronological/sequence ordering within that format.

**200 Response**
```json
{
  "data": [
    {
      "id": 42,
      "ticketNumber": "2608-0007",
      "summary": "Laptop battery drains quickly",
      "category": { "id": 2, "name": "Hardware" },
      "requestedPriority": "MEDIUM",
      "currentStatus": "NEW",
      "updatedAt": "2026-08-25T06:30:00.000Z"
    }
  ],
  "meta": {
    "page": 1,
    "pageSize": 10,
    "totalCount": 23,
    "totalPages": 3,
    "hasNextPage": true,
    "hasPreviousPage": false
  }
}
```
Search/filter apply before pagination; `totalCount` reflects the filtered result set. Empty result returns `"data": []` with valid meta (UI distinguishes empty vs no-results, BR-22).

**Errors**: 400 unknown param / invalid value; 500 safe.

### 5.3 GET /api/tickets/:id
One owned Ticket detail (FR-08, BR-23).

**Query**: `requesterId` (required).

**200 Response**: same shape as 5.1 response, including full `attachments` metadata array:

```json
"attachments": [
  {
    "id": 9,
    "originalFilename": "battery-screenshot.png",
    "mimeType": "image/png",
    "sizeBytes": 184320,
    "removedAt": null,
    "removedReason": null,
    "createdAt": "2026-08-25T06:31:02.000Z"
  }
]
```
Removed attachments remain listed with non-null `removedAt`/`removedReason` (BR-17).

**Errors**: 404 when missing **or** owned by another requester (AC-10).

## 6. Attachment Endpoints

### 6.1 POST /api/tickets/:id/attachments
Upload one permitted Attachment to an owned Ticket (FR-09).

**Request**: `requesterId` is passed as a **query parameter** (consistent with all other attachment endpoints); the `multipart/form-data` body contains only the `file` field.

**Fixed constraints** (BR-14)
| Constraint | Enforcement | Failure status |
|---|---|---|
| Type ∈ {JPG/JPEG, PNG, WEBP, PDF} | content-type + extension check | **415** |
| Size ≤ 5 MB (5,242,880 bytes) | exact byte check | **413** |
| ≤ 5 active attachments per ticket | count check before insert | **409** |

Storage filename is sanitized/generated server-side (Assumption 4); original filename kept as metadata.

**201 Response**
```json
{
  "id": 10,
  "ticketId": 42,
  "originalFilename": "battery-screenshot.png",
  "mimeType": "image/png",
  "sizeBytes": 184320,
  "removedAt": null,
  "createdAt": "2026-08-25T07:00:00.000Z"
}
```

**Errors**: 404 ticket missing/not-owned; 400 no file provided; 409 active-attachment limit reached; 415 wrong type; 413 oversize. Failed uploads create no record (BR-18).

### 6.2 GET /api/attachments/:id
Attachment metadata (FR-10).

**Query**: `requesterId` (required). Ownership resolved through the parent Ticket (BR-09).

**200 Response**: same shape as 6.1 response plus `removedReason` when removed.

**Errors**: 404 missing/not-owned (AC-24).

### 6.3 GET /api/attachments/:id/download
Download one **active** Attachment's binary content (FR-10).

**Query**: `requesterId` (required).

**200 Response**: binary stream; headers `Content-Type` (stored mime), `Content-Disposition: attachment; filename="<originalFilename>"`.

**Errors**: removed attachment → 404 (BR-17); missing/not-owned → 404 (AC-24).

### 6.4 POST /api/attachments/:id/remove
Soft-remove one active Attachment of an owned Ticket (FR-10, BR-15). No DELETE endpoint is exposed.

**Body**
```json
{ "reason": "Uploaded wrong screenshot" }
```
`reason` required, non-empty after trimming (BR-16). Server sets `removedAt` (UTC) — the soft-removal source of truth.

**200 Response**
```json
{
  "id": 10,
  "removedAt": "2026-08-25T07:12:00.000Z",
  "removedReason": "Uploaded wrong screenshot"
}
```
Removal is conflict-safe: removing an **already-removed** attachment returns **409 Conflict** (the attachment exists but is no longer active); a missing or not-owned attachment still returns 404.

**Errors**: 400 missing/blank reason (+fieldError); 404 missing/not-owned; 409 already removed.

## 7. Cross-Cutting Behaviors

- **Safe unexpected errors** (AC-25): any unhandled exception returns the generic 500 envelope; no stack traces, SQL, or internal identifiers leak.
- **Duplicate submission** (AC-05): prevented at the UI layer (busy/disabled Submit); the API itself performs standard validation only — no idempotency keys in Lab 2.
Traceability: API behaviors in this document provide API-level evidence for the applicable Acceptance Criteria. UI, responsive, and visual criteria are covered separately in `ui-spec.md` and `tests.md`.

Example API-level mappings:
- Strict query behavior → AC-16
- Search semantics → AC-12
- Removal flows → AC-21–AC-22
- Partial-upload failure → AC-23
