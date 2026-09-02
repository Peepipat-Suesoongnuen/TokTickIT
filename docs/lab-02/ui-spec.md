# Lab 2 UI Specification — TokTickIT Zen Green Theme

Companion contract to [specification.md](./specification.md) Section 6 and [api-spec.md](../lab-02/api-spec.md). All API behavior referenced here is defined in api-spec.md; all business rules as BR-xx in specification.md.

## 1. Color Tokens and Usage

| Token | Hex | Intended use |
|---|---|---|
| Primary green | `#006B3C` | App header background, primary actions (Submit, Continue, Create Ticket), strong emphasis |
| Secondary green | `#0B7A46` | Active tabs, focus accents, links, hover states of primary elements |
| Pale green | `#EAF6EF` | Selected rows/cards, success callouts, subtle section emphasis |
| Page background | `#F5F7F6` | Page background (quiet near-white) |
| Surface | `#FFFFFF` | Cards, panels, form containers — subtle border (`#DDE5E0`) and restrained shadow |
| Text primary | `#22332B` | Dark charcoal-green body text (never pure black) |
| Text secondary | `#5B6B62` | Muted labels, metadata, timestamps |
| Read-only field fill | `#EEF3EF` / ivory `#FBFAF4` | Read-only inputs — clearly distinct from editable but readable |
| Error | `#8B1E1E` text/border | Field errors and destructive emphasis |
| Warning | amber badge/callout `#B7791F` on `#FFF7E6` | Warnings only — never decoration |
| Success | pale green bg + dark green text + check icon | Confirmations (not color alone — always icon/text) |

## 2. Typography and Spacing

- **Font**: system UI stack or Bootstrap default; base size 16px; line-height ≥ 1.5.
- **H1** 24–28px (screen titles); **H2** 20px (section headings); **body** 16px; **small/meta** 13–14px.
- Labels above controls, font-weight 600, margin-bottom 4px.
- Spacing scale: 4 / 8 / 12 / 16 / 24 / 32 px. Card padding 16–24px; section gap 24px.
- One consistent input height (40px desktop); Description textarea taller (~140px) and resizable only vertically.
- Max content width ~1200px centered (desktop).

## 3. Control States

| State | Style |
|---|---|
| Editable field | White background, neutral border `#C9D2CC`; focus = secondary green border + visible focus ring |
| Read-only field | Soft gray-green `#EEF3EF` or ivory fill, not-allowed cursor, never looks clickable |
| Invalid field | Dark red border `#8B1E1E` + message directly below the field |
| Disabled control | Reduced opacity (≥ 55%), grayed, `disabled` attribute set — cannot be activated |
| Focused control | Visible focus indicator (2px secondary-green outline) — never removed for aesthetics |

- **Required fields**: red asterisk `*` after the label. The asterisk does NOT replace the validation message.
- **Validation messages**: appear immediately below the associated field, dark red, with a warning glyph; never a single mystery error at top only (BR-10, FR-06).
- **Buttons hierarchy**:

| Level | Style | Examples |
|---|---|---|
| Primary | Filled #006B3C, white text | Continue, Submit Ticket, Create Ticket |
| Secondary | Outlined green | Cancel, Change Requester, Clear Filters |
| Tertiary | Text link green | Download, Remove (per-row) |
| Destructive | Dark red filled/outlined | Confirm Removal inside modal |
| Busy | Spinner replaces icon + "Submitting…", disabled | Submit during request (BR-12) |
| Disabled | As state table above | Submit while invalid/submitting |

## 4. Application Shell and Navigation

- Header bar: Primary green background; left = **TokTickIT** wordmark + subtitle "IT Service Desk"; right = selected Development Requester chip (person icon + name) + **Change Requester** button.
- Nav tabs below header (or hamburger <768px): **My Tickets**, **Create Ticket**. Active tab = white text on secondary green underline/fill — always visibly indicated.
- Mobile navigation collapses into a touch-friendly menu (min tap target 44×44px); requester chip remains visible.
- No selection made → every guarded route redirects to the Requester Selection screen (BR-04).

## 5. Screen Specifications

### 5.1 Requester Selection Screen
Elements (labsheet-required): TokTickIT title; explanatory text exactly conveying: *"Select a Development Requester to test requester-specific ticket behavior. This is not a login screen."* + note that authentication arrives in Lab 3; Requester dropdown (active requesters from `GET /api/requesters`, ordered by name); **Continue** button (primary, disabled until selection).

States: loading ("Loading requesters…" spinner); empty ("No active requesters available"); API failure (safe message from error envelope + Retry button). Keyboard accessible: dropdown and button reachable via Tab, operable via Enter/Space; labels bound with `for`/`id`.

After Continue: shell shows requester name; Change Requester returns here; switching reloads requester-specific data (BR-06).

### 5.2 Create Ticket Screen (Create Mode)

Layout order (desktop):
1. **System-generated / read-only panel** (top, visually distinct read-only style): Ticket Number — shown as "Generated after submission" placeholder pre-create; Ticket Date — "—" until created; Requester — prefilled from selection, read-only (BR-08).
2. **Classification group**: Category select (active categories), Related System select (active systems), Requested Priority select (`LOW/MEDIUM/HIGH/CRITICAL`) — all required `*`.
3. **Summary** input (required, maxlength hint 120) and **Description** textarea (required, ~140px height, hint 20–2,000 chars).
4. **Attachments** section: file picker accepting `.jpg/.jpeg/.png/.webp/.pdf`; per-file list showing name + size + upload state; helper text "JPG, PNG, WEBP or PDF, up to 5 MB each, max 5 files".

   **Invalid selected file** — remains visible in the local file list with an error message explaining the rejected type or size. The invalid file is **not submitted for upload**; the entry is dismissible and does not count toward the active-attachment limit.
5. **Screen heading/navigation**: `Create Ticket` heading on the left and **Back to My Tickets** (secondary outlined link to `/my-tickets`) on the top right, immediately above the read-only panel. On mobile this heading/action row may stack without horizontal overflow. The Back action is navigation only and must not submit the form.
6. **Actions row** bottom: Submit Ticket (primary, busy state while processing BR-12) + Clear (secondary). `Back to My Tickets` is not duplicated in this bottom form-action row.

States:
- Initial — empty form, reference data loaded, no messages.
- Loading — skeleton/spinner while reference data loads.
- Validation failure — field-level messages under each offending field; first invalid field receives focus.
- Submitting — Submit disabled + spinner + "Submitting…" (no duplicate requests, AC-05).
- Success — success callout (pale green, check icon) displaying official Ticket Number from backend + buttons "View My Tickets" and "Create Another" (AC-01).
- API failure — safe error banner; **all entered values preserved** (AC-26).
- Reference-data failure — safe error state with Retry. Category and Related System controls remain disabled until reference data loads successfully. Submit Ticket is disabled while required reference data is unavailable. Already-entered Summary and Description values are preserved.

### 5.3 My Tickets Screen
Heading actions: **Clear Filters** (secondary, disabled when search/filter/sort state is already at defaults) beside **Create Ticket** (primary). Clear Filters resets search, Category, Requested Priority, Current Status, and sort/direction to `updatedAt DESC`; page size is not a filter and is preserved.

Toolbar: five visibly labelled controls — **Search** (placeholder `Search ticket number or summary…`, implements api-spec §5.2 semantics), **Category**, **Requested Priority**, **Current Status** (`All Statuses` / `NEW` only in Lab 2), and **Rows per page** (10/20/50) — plus pagination bar (Previous / page numbers / Next). Visible labels and accessible names use the same terminology. The Current Status filter is read-only list filtering only; it does not introduce a status-changing workflow.

Desktop table columns: Ticket Number · **Created** (official `ticketDate`, formatted `YYYY-MM-DD HH:MM:SS` Asia/Bangkok, Assumption 3) · Summary · Category · Requested Priority (badge) · Current Status (badge `NEW`) · Last Updated (same display timezone/format). Ticket Number, Created, Requested Priority, and Last Updated headers are sortable controls. Created sorts through the existing `sort=ticketDate` API contract and uses the same descending-first/toggle behavior as Ticket Number. The active sortable header exposes ascending/descending state (for example `aria-sort`) and visibly indicates direction. Header typography is uniform, slightly smaller than body text, and uses Zen Green emphasis while sort direction remains visible without relying on color alone. Row click → Ticket Detail; Ticket Number remains a real accessible link so keyboard/assistive-technology navigation does not depend on row-click JavaScript. There is no separate Action/Open column.

Table visual hierarchy: the desktop/tablet header uses a **muted light Zen Green** background with darker green text/sort glyphs so it is clearly grouped but intentionally less visually dominant than the application's primary dark-green header/navigation. Data rows use neutral zebra striping (white / very light gray) rather than reusing the header green. Row hover uses a slightly darker neutral gray while preserving readable badges/links. Keyboard focus on sortable header controls remains clearly visible against the light header.

Desktop/tablet table geometry uses a stable explicit seven-column sizing plan rather than browser content-driven auto-layout. Long Category values (for example `Account and Access`) must not re-plan the entire table width between pages/filter results. Summary keeps its complete value in the DOM but is visually constrained to a consistent two-line area with CSS line-clamp/ellipsis (`…`); users open Ticket Detail to read the full value. This keeps row density predictable without truncating stored or accessible data. No horizontal **page** scrolling is allowed.

Mobile (<768px): card list — one card per ticket with the same fields stacked, with Created shown immediately after Ticket Number and Last Updated later in the metadata; badges inline; no horizontal scrolling (AC-27). Because cards have no table headers, an explicit mobile sort control provides Ticket Number / Created / Requested Priority / Last Updated sorting and direction. Card click opens Ticket Detail while Ticket Number remains an accessible link.

Category metadata loads independently from the ticket list. While loading, the Category filter is disabled. If loading fails, the ticket list remains visible and a safe `Unable to load categories` state with a Retry action is shown; stale responses from a previously selected requester must not update either list.

Badge rules:
| Value | Badge |
|---|---|
| LOW | gray outline |
| MEDIUM | neutral/green |
| HIGH | orange/red |
| CRITICAL | red |
| NEW (status) | pale green + dark green text + dot icon |

States: loading (spinner/skeleton); empty ("You have not created any tickets yet" + Create CTA) — **distinct** from no-results ("No tickets match your search or filters" + Clear Filters CTA) per BR-22; API failure (safe message + Retry).

### 5.4 Requester Ticket Detail Screen (View Mode)
All ticket header information rendered **read-only** (read-only field styling): Ticket Number, Ticket Date, Requester, Category, Related System, Summary, Description (full width), Requested Priority badge, Current Status badge. No edit affordances; no comments/internal notes/actions/status-change controls (Scope exclusion).

Screen heading/navigation: `Ticket {ticketNumber}` on the left and **Back to My Tickets** (secondary outlined real link to `/my-tickets`) on the top right above the read-only Ticket card. The control is navigation only; it does not edit/delete the Ticket or mutate Attachments. On narrow mobile widths the heading/action row may stack cleanly. The existing 404/not-owned safe state also retains its Back-to-My-Tickets route.

**Attachment section** (visually separated card): list rows with name, size, uploaded date, and state-dependent actions:

| Attachment state | Display | Actions |
|---|---|---|
| Active | file icon + name + size | Download (tertiary), Remove (tertiary → modal) |
| Uploading | progress spinner, name dimmed | none |
| Invalid (rejected type/size) | red text reason under entry | entry not persisted — dismissible |
| Removed | name struck-through/muted + "Removed {date} — Reason: …" | no download/preview (BR-17) |
| Unavailable (fetch fails) | muted row + retry link | Retry |

Add-attachment control (file picker) enabled while active count < 5 (BR-14); at limit show helper "Maximum of 5 active attachments reached".

**Removal modal** (Assumption 5): title "Remove Attachment?"; shows filename; mandatory non-empty **Reason** textarea; buttons Cancel (secondary) / Confirm Removal (destructive, disabled until reason valid). On confirm calls `POST /api/attachments/:id/remove`; on success row transitions to Removed state.

Download of removed attachment must be impossible in UI (action absent) and blocked by API (BR-17).

States: loading (skeleton); 404/not-owned (safe "Ticket not found" + back link, AC-10); API failure (safe banner + Retry).

## 6. Responsive Rules

| Viewport | Behavior |
|---|---|
| Desktop ≥992px | Multi-column classification group (3 selects in one row); Summary/Description full-width; centered max-width 1200px |
| Tablet 768–991px | Classification wraps to two columns; Summary/Description keep sufficient width |
| Mobile <768px | Everything stacks vertically; full-width touch-friendly buttons (≥44px height); tables become card lists; **no horizontal page scrolling** |
| All sizes | No clipped labels, overlapping messages, hidden buttons, or truncated unreadable filenames (AC-27) |

## 7. Accessibility

- Every icon-only control (e.g., pagination arrows if iconified) has `aria-label` + tooltip.
- Labels programmatically bound (`for`/`id`); selects are native where possible.
- Focus indicators always visible; logical tab order; modals trap focus, close on Esc, return focus on close.
- Status/priority conveyed by text, not color alone; error/success announced via `aria-live="polite"`.
- Red asterisk paired with `aria-required` and text hint.

## 8. Feedback & Error Message Sources

- Validation messages: fixed copy per rule (e.g., "Summary must contain 5–120 characters.", "Description must contain 20–2,000 characters.", "Please select a category.") mirroring api-spec §5.1 fieldErrors keys.
- API failures: render server `error.message` when present; otherwise generic safe copy ("Unable to connect to TokTickIT API. Please try again."). Never expose raw fetch errors or internals.
- Success: confirmation includes backend-generated Ticket Number (never client-generated).

## 9. Visual Inspection Checklist (to be executed in Issue 12)

- [ ] Colors match tokens (header/actions #006B3C; accents/hover #0B7A46; selections #EAF6EF; bg #F5F7F6)
- [ ] Editable vs read-only fields visually distinct at a glance
- [ ] Asterisks on all required fields; messages directly beneath their fields
- [ ] Button hierarchy consistent (primary/secondary/tertiary/destructive/busy/disabled)
- [ ] Badges: priority + status consistent across list and detail
- [ ] No clipping, overlap, unintended horizontal scroll at 1440 / 900 / 375 widths
- [ ] Filters, pagination, attachment controls usable at all sizes
- [ ] Empty vs no-results states both reachable and visually distinct
- [ ] Screens match approved illustrations, not memory

**Screenshot paths** (Playwright, three viewports each):
```
artifacts/lab-02/screenshots/create-ticket/{desktop,tablet,mobile}.png
artifacts/lab-02/screenshots/my-tickets/{desktop,tablet,mobile}.png
artifacts/lab-02/screenshots/ticket-detail/{desktop,tablet,mobile}.png
artifacts/lab-02/screenshots/requester-selection/desktop.png
artifacts/lab-02/screenshots/states/{loading,validation,submitting,success,failure,empty,no-results,removed-attachment}.png
```
