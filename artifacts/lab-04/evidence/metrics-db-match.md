# Issue #82 — Dashboard metric to database verification

Date: 2026-10-30 (Asia/Bangkok)
Code pin: `c3f8ab3f1575216611a708b8797ca45799b178d9`
Raw verbose test output: [`metrics-db-match.txt`](./metrics-db-match.txt)

Command:

```powershell
cd server
$env:TEST_DATABASE_URL="postgresql://toktickit:toktickit@localhost:5432/toktickit_test?schema=public"
$env:DATABASE_URL=$env:TEST_DATABASE_URL
npx vitest run --reporter=verbose tests/lab-04/staff-dashboard.api.test.ts tests/lab-04/requester-dashboard.api.test.ts
```

Result: 2 test files passed; 11 tests passed; exit code 0. The fixtures are run-namespaced and comparisons avoid global database counts.

| Surface | Test proof | Result |
|---|---|---|
| Staff attribution metrics | API-22 creates owned, assigned, unassigned, priority/status and completed-action fixtures and checks before/after metric deltas: owned +2, assigned +1, unassigned +1, urgent +2, recorded +1, OPEN +3, IN_PROGRESS +1, HIGH +1, CRITICAL +1. | Passed |
| Staff drill-down parity | API-23/23c compares dashboard metric values with the filtered queue destination count, including the assigned-to-me dataset. | Passed |
| Requester ownership and counts | API-21 verifies owned-only lists and metrics, zero-ticket output, and exact drill-down links. The recently-resolved metric is compared with a direct `prisma.ticket.count`; seven owned terminal tickets yield metric 7 while the bounded list contains five. | Passed |
| Cross-requester isolation | SEC-02 checks every returned ticket against the requester-scoped DB query and verifies no foreign rows leak. | Passed |

This run establishes local API/DB parity only. It is not hosted CI evidence and does not establish the final-main release rung.
