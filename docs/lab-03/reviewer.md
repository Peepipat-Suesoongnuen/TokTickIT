# Lab 3 Reviewer Record — TokTickIT

**Author:** Peepipat Suesoongnuen — 67070507207 — GitHub: @Peepipat-Suesoongnuen
**Lab workflow:** feature branch → peer-reviewed PR → `lab3-staging`; final release is peer-reviewed through `lab3-staging -> main`.

This record is based on GitHub PR/review history. It does not treat an AI review draft as peer-review evidence unless a review was actually submitted on GitHub. Every state, SHA, and merge commit below was read from live GitHub state and re-verified against the review API during final release preparation.

## Merged Lab 3 pull requests

| PR | Branch | Scope (Issue) | Head | Merged | Review rounds | Final approval |
|---|---|---|---|---|---|---|
| [#54](https://github.com/Peepipat-Suesoongnuen/TokTickIT/pull/54) | `feature/15-lab3-engineering-contract` | Sprint 3 Engineering Contract (docs only, #43) | `2ca5098` | 2026-09-15 | 3× Request Changes → fixes → re-review (Tanaboonnnnn) | Tanaboonnnnn |
| [#56](https://github.com/Peepipat-Suesoongnuen/TokTickIT/pull/56) | `feature/16-user-migration-seed` | User migration/credentials/seed (#44) | `3146e4a` | 2026-09-17 | Request Changes (Tanaboonnnnn, L0u1sss) → fixes → re-review | Chxtamos |
| [#58](https://github.com/Peepipat-Suesoongnuen/TokTickIT/pull/58) | `feature/17-authentication` | Authentication/session/logout/mandatory change (#45) | `0686e8f` | 2026-09-18 | Request Changes (chaproi, Chxtamos, Tanaboonnnnn, L0u1sss, cottonlnwza) → fixes → re-review, approved by L0u1sss | L0u1sss |
| [#59](https://github.com/Peepipat-Suesoongnuen/TokTickIT/pull/59) | `feature/18-authorization-requester-regression` | Authorization cutover + Requester regression (#46) | `6b38b9a` | 2026-09-19 | 1× Request Changes (Chxtamos, role-guard blocker) → fix → re-review | Tanaboonnnnn |
| [#60](https://github.com/Peepipat-Suesoongnuen/TokTickIT/pull/60) | `feature/19-20-staff-ticket-workspace` | Staff Ticket workspace (#48) | `2f9e8eb` | 2026-09-20 | Approved without changes | Tanaboonnnnn |
| [#61](https://github.com/Peepipat-Suesoongnuen/TokTickIT/pull/61) | `feature/21-comments-notes-resolution-indication` | Comments/notes/resolution (#49) | `640bc68` | 2026-09-21 | Approved without changes | Tanaboonnnnn |
| [#62](https://github.com/Peepipat-Suesoongnuen/TokTickIT/pull/62) | `feature/22-admin-user-management` | Administrator User Management (#50) | `f1bad62` | 2026-09-22 | 2× Request Changes (spec-blocker: out-of-contract admin-list extras) → Path C revert → re-review | Tanaboonnnnn |
| [#64](https://github.com/Peepipat-Suesoongnuen/TokTickIT/pull/64) | `feature/23-lab3-e2e-visual-evidence` | E2E/security/a11y/visual evidence (#51) | `d2d5c3e` | 2026-09-22 | 1× Request Changes (VISUAL-01 coverage gap) → matrix completed → re-review | Tanaboonnnnn |
| [#65](https://github.com/Peepipat-Suesoongnuen/TokTickIT/pull/65) | `feature/24-lab3-release-integration` | Lab 3 release integration package (#52) | `4e4062c` | 2026-09-23 | Approved without changes | Tanaboonnnnn |
| [#66](https://github.com/Peepipat-Suesoongnuen/TokTickIT/pull/66) | `feature/57-db-separation-guard` | Fail-closed dev/test database separation guard (#57) | `ea15c52` | 2026-09-23 | 2× Request Changes → fixes → re-review | Tanaboonnnnn |
| [#68](https://github.com/Peepipat-Suesoongnuen/TokTickIT/pull/68) | `feature/67-staff-detail-tabs-mockup` | Staff Ticket Detail tabs + readonly fields per mockup (#67) | `4bfb2ee` | 2026-09-25 | Approved without changes | Chxtamos |

## Opened but not merged

- [PR #53 — Lab 3: engineering contract and requester mockups](https://github.com/Peepipat-Suesoongnuen/TokTickIT/pull/53) (`feature/15-lab3-engineering-contract` → `lab3-staging`): contract draft closed unmerged with no reviews/comments the same day PR #54 opened; superseded by #54. Not part of the merged line.
- [PR #55 — feat: Lab 3 user migration, credentials, seed data (#44)](https://github.com/Peepipat-Suesoongnuen/TokTickIT/pull/55) (`feature/16-user-migration-seed` → `lab3-staging`): opened without owner instruction and closed unmerged the same day with an explanation; its work re-entered review properly as PR #56. Not part of the merged line.

## Review feedback I received and how I handled it

### PR #54 — contract defects before downstream implementation

Tanaboonnnnn submitted 3× `CHANGES_REQUESTED`: mojibake/encoding fixes, Admin list scope (Status filter removal per Labsheet), bcrypt 72-byte vs 64-char policy, Origin/CSRF fail behavior, seed-rerun evidence; then the owner/admin concurrency race (BR-76); then attachment-matrix vs migration-strategy fork. Each round was fixed in contract revisions and re-reviewed. First **APPROVED** on exact head `9f35d50`, followed by polish fixes (API-15b traceability, MIG-02b mapping) and a final **APPROVED** on exact head `2ca5098` — the PR head that merged — with exact-head CI green before merge.

### PR #56 — migration/seed blockers and evidence hygiene

Tanaboonnnnn requested changes on the multi-group collision guard bug and shared Argon2 salt, then on stale PR metadata and WASI dependency semantics; L0u1sss requested changes on PR-body/contract scope mismatch and missing reviewer/ai-use docs; Chxtamos re-reviewed the lockfile semantics. Fixes included the any-group guard with 2-group regression, per-user salts, synced PR evidence, and regenerated lockfile. Final **APPROVED** by Chxtamos on exact head `3146e4a` before merge.

### PR #58 — authentication security and scope boundaries

chaproi (lockout race, timing oracle, route-429 wiring), Chxtamos (production gate wiring), Tanaboonnnnn (logout desync), L0u1sss (identity cutover belongs to #46; queue-index docs mismatch), cottonlnwza (spec/index evidence). Fixes: atomic lock transition, decoy verification, route-level tests, production middleware wiring, clear-on-success logout, clarified #46 dependency. L0u1sss withdrew the cutover blockers as out-of-scope. Final **APPROVED** by L0u1sss before merge.

### PR #59 — missing Requester role guard

Chxtamos submitted 1× `CHANGES_REQUESTED`: Requester Ticket/Attachment routes lacked an explicit backend `REQUESTER` role guard. Fixed with the guard plus direct IT Staff/Admin denial tests. Final **APPROVED** by Tanaboonnnnn on exact head `6b38b9a` (noting only stale PR-body CI wording, non-blocking) before merge.

### PR #62 — out-of-contract admin extras

Tanaboonnnnn submitted 2× `CHANGES_REQUESTED`: the User ID column, Status filter, and client pagination contradicted Issue #50 and the checked-in contract with no amendment. Resolved via Path C: extras reverted out and parked in follow-up Issue #63. Final **APPROVED** on exact head `f1bad62` before merge. Issue #63 was later formally dropped and closed (2026-09-25): no amendment was approved, and the extras remain exclusions per Lab Sheet 3 §§4.2/8.5, so no Lab 3 requirement was lost. The reverted shape stays documented in the closed issue for history. No contract document was silently rewritten at any point.

### PR #64 — visual evidence gaps

Tanaboonnnnn submitted 1× `CHANGES_REQUESTED`: conditional Requester Detail capture could pass VISUAL-01 with no evidence, and Admin/mobile viewports were missing against the checklist. Fixed with deterministic fixtures and the full viewport matrix. Final **APPROVED** on exact head `d2d5c3e` before merge.

### PR #66 — missing README and semantics mismatch

Tanaboonnnnn submitted 2× `CHANGES_REQUESTED`: required README update absent, and same-target semantics diverged from Issue #57. Resolved by amending the Issue semantics explicitly, updating the README, and using the guard wrapper around migrate/seed. Final **APPROVED** on exact head `ea15c52` before merge.

### PRs #60, #61, #65, #68 — approved without changes

Each received a single **APPROVED** (Tanaboonnnnn for #60/#61/#65, Chxtamos for #68) with no Request Changes rounds. Chxtamos left one non-blocking formatting nit on #68.

## Pull Requests I reviewed for peers

GitHub records show Lab 3 reviews submitted from @Peepipat-Suesoongnuen, verified per review. The peer-review rule used throughout was: **their contract → their implementation → their tests → their CI**. Findings were not based on differences from this repository's implementation style.

| Repository / PR | Review contribution |
|---|---|
| [Chxtamos/-TokTickIT- #82 — Lab 3: Complete Administrator User Management and safety](https://github.com/Chxtamos/-TokTickIT-/pull/82) | **APPROVED** 2026-09-25: verified safety core, concurrency evidence, and CI counts on exact HEAD |
| [Chxtamos/-TokTickIT- #81 — Feature 34: Integrate Staff Ticket Detail UI](https://github.com/Chxtamos/-TokTickIT-/pull/81) | **APPROVED** 2026-09-25: verified contract match, 409 paths, and CI on exact HEAD |
| [Tanaboonnnnn/toktickit #69 — Final evidence sync](https://github.com/Tanaboonnnnn/toktickit/pull/69) | **APPROVED** 2026-09-24: verified doc-only scope, COMMENTED-not-promoted history, and exact-main CI |
| [Chxtamos/-TokTickIT- #72 — Requester authorization](https://github.com/Chxtamos/-TokTickIT-/pull/72) | 3× **CHANGES_REQUESTED** 2026-09-18 on identity/matrix gaps; final approval by @L0u1sss before merge |
| [thananun-7203/toktickit #45 — Staff Ticket Detail & Operations](https://github.com/thananun-7203/toktickit/pull/45) | **APPROVED** 2026-09-17: verified concurrency protocol and spec matrix |
| [Chxtamos/-TokTickIT- #70 — Migration/seed](https://github.com/Chxtamos/-TokTickIT-/pull/70) | **CHANGES_REQUESTED** (fixture row-order root cause, seed flake, AC-07 evidence) → **APPROVED** 2026-09-17 after fixes verified |

## Reviewer identities

Peer reviewers (GitHub collaborators): Tanaboonnnnn, L0u1sss, Chxtamos,
chaproi, cottonlnwza. Final approver per PR is listed above; every approval
applies to the exact head SHA shown, verified against hosted CI on that head
before merge.

## Response discipline

Every Request Changes round was answered with: per-comment audit against the
Labsheet and checked-in contract (classifications: valid blocker/minor,
already-fixed, out-of-scope, misunderstanding, needs-clarification), the
smallest compliant fix, re-run tests plus regression, and refreshed
exact-head CI. Replies are posted on the PRs themselves and remain readable
there; this file records the trail, not duplicates of every comment.

## Final release status

Completed staging gates:

- Issues #43–#51, #57, and #67 are closed with peer-reviewed merges into
  `lab3-staging` as listed above; Issue #63 follow-up was formally dropped
  and closed (exclusions, not requirements). Issue #52 was closed early and
  has been   reopened (board: Backlog) pending the release PR, exact
  final-main verification, and the submission PDF, per its own acceptance
  criterion.
- Current `lab3-staging` tip `14680e7` (merge of PR #68) has hosted CI run
  #170 SUCCESS.

Still pending (not claimed):

- The peer-reviewed `lab3-staging -> main` release PR has not been opened yet.
- Exact final-`main` verification and the final submission PDF (with
  owner-authored prompts/reflection) have not been produced yet.
- The author does not self-merge the release PR.
