# Issue #82 — Evidence ledger

Append-only record. Pins identify the tree or run the evidence proves; recording may happen later. Local results do not imply hosted CI, approval, or merge.

| ID | Event | Rung | Pin | Artifact / result |
|---|---|---|---|---|
| E-01 | RC resolved; implementation pre-exists on staging | IMPLEMENTED (pre-existing) | `RC_SHA=c3f8ab3f1575216611a708b8797ca45799b178d9` | `baseline-verification.md`; `docs/lab-04/reviewer.md` PR inventory |
| E-02 | Server suite | LOCALLY VERIFIED | `RC_SHA` | `baseline-verification.md`: 47 files / 344 tests, exit 0 |
| E-03 | Client suite + build | LOCALLY VERIFIED | `RC_SHA` | `baseline-verification.md`: 21 files / 188 tests; build exit 0 |
| E-04 | Server and client typecheck | LOCALLY VERIFIED | `RC_SHA` | `baseline-verification.md`: both `npx tsc --noEmit`, exit 0 |
| E-05 | Lab 4 E2E retries 0 on baseline | LOCALLY VERIFIED | `RC_SHA` | `baseline-verification.md`: 11/11 passed, 6 spec files |
| E-06 | Lab 2–3 regression | LOCALLY VERIFIED | `RC_SHA` | `baseline-verification.md`: 20/20 passed |
| E-07 | Multi-action and history captures | EVIDENCE CAPTURED | `DOC_SHA=bef9fb22c82de0e60a5a5381006a5b331c9d3713` | `screenshots/actions-taken/multiple-actions.png`; `screenshots/actions-taken/history.png`; test in `e2e/lab-04/visual-states.spec.ts` |
| E-08 | Dashboard metric-to-DB run | EVIDENCE CAPTURED | `RC_SHA` | `metrics-db-match.txt` and `metrics-db-match.md`; 2 files / 11 tests passed |
| E-09 | §10 visual checklist and visual/a11y review | EVIDENCE CAPTURED | `DOC_SHA=bef9fb22c82de0e60a5a5381006a5b331c9d3713` | `visual-a11y-checklist.md`; five §10 boxes ticked with citations |
| E-10 | Evidence commit + hash binding | EVIDENCE CAPTURED | `DOC_SHA=bef9fb22c82de0e60a5a5381006a5b331c9d3713` | Verified `git hash-object` against commit blobs for history/multiple-actions screenshots, metrics output/summary, and evidence ledger; hashes match |
| E-11 | Feature PR CI 4/4 | PLANNED | `DOC_SHA` | Awaiting PR head CI |
| E-12 | Artifacts present in CI-verified tree | PLANNED | `DOC_SHA` | Awaiting tree check |
| E-13 | Feature PR approval | PLANNED | `DOC_SHA` | Awaiting peer review |
| E-14 | Feature PR merged | PLANNED | `STAGING_MERGE` | Awaiting human merge |
| E-15 | Release PR CI + approval | PLANNED | `RELEASE_REVIEWED` | Awaiting release review |
| E-16 | Release merged; main push CI 4/4; ancestry + tree check | PLANNED | `MAIN_MERGE` | Awaiting human merge and exact-head push run |
| E-17 | Sync PR CI 4/4 → merged; final main push CI 4/4; tree equality | PLANNED | `FINAL_EVIDENCE` | Awaiting sync PR, human merge, push run, and separately approved Issue timeline record |
| E-18 | PDF render + verification | PLANNED | cites `MAIN_MERGE`; final tree `FINAL_EVIDENCE` | Awaiting final document edits and render |
| E-19 | `tests.md` truth sweep | EVIDENCE CAPTURED | `DOC_SHA=bef9fb22c82de0e60a5a5381006a5b331c9d3713` | Case-insensitive PowerShell sweep for `To be created|rest unopened|unopened|Not yet available` returned zero matches |
