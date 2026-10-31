# Issue #82 — Visual and accessibility checklist

Date: 2026-10-30 (Asia/Bangkok)
Sources: `docs/lab-04/ui-spec.md` §§8–9; `docs/lab-04/tests.md` §10
Verification: Lab 4 Playwright, retries 0; accessibility and responsive component tests; visual inspection of the two new captures.

Latest full Lab 4 run after the test change: `npx playwright test --project=lab-04 --retries=0`, 12/12 passed, exit code 0. The run also refreshed `artifacts/lab-04/perf/dashboard-smoke.json`; its latest measurement is recorded in that file and remains measure-only, with no threshold claim.

Stability note: an earlier full Step 2 run had two E2E failures while creating actions. The captured UI alert was `Action date must be within [ticket date, now + 1h]`. The form's “Use current time” value is second-precision while the ticket timestamp can contain fractional seconds, so the same-second boundary is a plausible cause. The failed E2E-01 passed on isolated rerun, and two later full Lab 4 runs passed 12/12 with retries 0. No product behavior was changed; treat this as a test-time boundary risk, not as a demonstrated production fix.

| Requirement | Evidence | Result |
|---|---|---|
| Dashboards and Actions area at 1440/900/375; no clipping, overlap, or horizontal overflow | `e2e/lab-04/visual-states.spec.ts` VISUAL-01; `checkNoOverflow` at each viewport; existing desktop/tablet/mobile dashboard and action captures | Verified by passing tests |
| Tables collapse to mobile cards with data parity | `client/src/features/lab-04/tests/ActionsTaken.test.tsx` — “collapses to cards on mobile with full data parity and responsive classes” | Verified by passing client suite |
| PLANNED/IN_PROGRESS/COMPLETED/CANCELLED have textual, distinct cues; follow-up is explicit | `ActionsTaken.test.tsx` — “badges every lifecycle status with a distinct class and never OPEN”; `multiple-actions.png` shows both terminal status labels | Verified by tests and capture |
| History appears as an ordered event trail; no history mutation controls are exposed | `actions-taken-flow.spec.ts`, `ActionsTaken.test.tsx` history coverage, `history.png` (CREATED → STATUS_CHANGED → CANCELLED) | Verified by tests and capture |
| Resolution gate blocker copy is visible and links to Actions | `ticket-resolution.spec.ts` E2E-02; `actions-taken/gate-blocked.png`; `ActionsTaken.test.tsx` “maps gate-blocked resolve to copy plus an Actions-activating link” | Verified by passing tests |
| Loading, empty, forbidden/conflict, and API failure states remain distinct; keyboard, focus, labels and dialog behavior work | `ActionsTaken.test.tsx` loading/retry, empty, conflict and failure cases; `e2e/lab-04/accessibility.spec.ts` A11Y-01 | Verified by passing tests |
| Required screenshots exist under the documented directories | `staff-dashboard/`, `requester-dashboard/`, and `actions-taken/`; new `multiple-actions.png` and `history.png` | Verified by file inventory |

The new captures were visually inspected at their rendered resolution. Existing screenshot files were reused and restored after the full suite regenerated them; only the two new capture files are retained from that run.
