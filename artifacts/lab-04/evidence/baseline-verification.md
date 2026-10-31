# Issue #82 — Baseline verification

Date: 2026-10-30 (Asia/Bangkok)
RC_SHA: `c3f8ab3f1575216611a708b8797ca45799b178d9` (`feature/31-release-integration`, tracking `origin/lab4-staging`)

The commands below ran against the guarded local test database `toktickit_test` with `TEST_DATABASE_URL` and `DATABASE_URL` set to that test target. The test-target guard passed before migration and seed. PostgreSQL loopback was reachable only outside the sandbox; the authorized external execution used the guard for both database-mutating commands.

| Evidence | Command(s) | Result |
|---|---|---|
| E-01 | `git rev-parse HEAD`; branch/ref inspection | `c3f8ab3f1575216611a708b8797ca45799b178d9`; release implementation already present on staging |
| E-02 | `cd server; npx tsc --noEmit; npm test` | Exit 0; 47 test files, 344 tests passed |
| E-03 | `cd client; npx tsc --noEmit; npm test; npm run build` | Exit 0; 21 test files, 188 tests passed; production build succeeded |
| E-04 | Server and client `npx tsc --noEmit` | Both exit 0 |
| E-05 | `npx playwright test --project=lab-04` (before test-only extension) | Exit 0; 11 tests passed across 6 spec files |
| E-06 | `npx playwright test --project=lab-02-03` | Exit 0; 20 tests passed |

The first migration attempt from the sandbox failed because sandbox networking denied localhost. The same guarded migration/seed commands succeeded outside the sandbox. No product source was changed during baseline verification. Playwright regenerated tracked screenshots during its run; those baseline-generated images were restored to `origin/lab4-staging` before Step 2.
