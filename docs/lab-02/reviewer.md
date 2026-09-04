# Lab 2 — Peer Review Record

**Author:** Peepipat Suesoongnuen — 67070507207 — GitHub: @Peepipat-Suesoongnuen
**Lab workflow:** feature branch → peer-reviewed PR → `lab2-staging`; final release is peer-reviewed through `lab2-staging -> main`.

This record is based on GitHub PR/review history. It does not treat an AI review draft as peer-review evidence unless a review was actually submitted on GitHub.

## Pull Requests I authored

| PR | Branch | Review / merge evidence |
|---|---|---|
| [#20](https://github.com/Peepipat-Suesoongnuen/TokTickIT/pull/20) | `feature/5-spec-test-plan` | Review feedback requested evidence/contract corrections; corrected, approved by @Chxtamos, merged to `lab2-staging` |
| [#21](https://github.com/Peepipat-Suesoongnuen/TokTickIT/pull/21) | `feature/6-db-design-seed` | Approved by @Chxtamos; merged |
| [#22](https://github.com/Peepipat-Suesoongnuen/TokTickIT/pull/22) | `feature/7-requester-context` | Initial comments on error-envelope/render/test debt; corrected/clarified, approved by @thananun-7203; merged |
| [#23](https://github.com/Peepipat-Suesoongnuen/TokTickIT/pull/23) | `feature/8-create-ticket` | Approved by @thananun-7203; merged |
| [#24](https://github.com/Peepipat-Suesoongnuen/TokTickIT/pull/24) | `feature/9-my-tickets` | Multi-round `CHANGES_REQUESTED` cycle; @Tanaboonnnnn then approved exact final head `a7843ed…` before merge. GitHub's aggregate `reviewDecision` still shows the historical change-request state, so the submitted approval record is the authoritative per-review evidence |
| [#25](https://github.com/Peepipat-Suesoongnuen/TokTickIT/pull/25) | `feature/10-ticket-detail-attachments` | Multiple review rounds found concurrency, validation, storage, modal/accessibility, and evidence issues; @Tanaboonnnnn approved corrected head `cc81a7e…` before merge |
| [#26](https://github.com/Peepipat-Suesoongnuen/TokTickIT/pull/26) | `feature/11-e2e-responsive` | Approved by @Tanaboonnnnn at exact head after hosted server/client/E2E checks passed; merged |
| [#28](https://github.com/Peepipat-Suesoongnuen/TokTickIT/pull/28) | `fix/8-create-ticket-test-coverage` | Approved by @Tanaboonnnnn at exact head after hosted checks passed; merged |
| [#29](https://github.com/Peepipat-Suesoongnuen/TokTickIT/pull/29) | `feature/12-ui-style-docs` | Approved by @Tanaboonnnnn on exact head `05a928a…`; reviewer noted only minor evidence-hygiene / maintainability points; merged |
| [#32](https://github.com/Peepipat-Suesoongnuen/TokTickIT/pull/32) | `feature/12a-my-tickets-ux-refinement` | Approved by @Tanaboonnnnn on exact head `704a488…`; hosted CI green; merged |
| [#33](https://github.com/Peepipat-Suesoongnuen/TokTickIT/pull/33) | `feature/12b-create-ticket-back-navigation` | Approved by @Tanaboonnnnn on exact head `c4b3fae…`; hosted CI green; merged |
| [#35](https://github.com/Peepipat-Suesoongnuen/TokTickIT/pull/35) | `feature/12c-my-tickets-readability-ticket-date` | Approved by @Tanaboonnnnn on exact head `930e469…`; merged as `ff25d1e…` with post-merge staging CI green |
| [#36](https://github.com/Peepipat-Suesoongnuen/TokTickIT/pull/36) | `feature/13-release-integration` | @Tanaboonnnnn first requested evidence-sync changes, then approved exact final head `c763999…`; peer merged as `e213b00…` and post-merge staging CI was green |
| [#39](https://github.com/Peepipat-Suesoongnuen/TokTickIT/pull/39) | `fix/14-my-tickets-sort-flicker` | Approved by @Tanaboonnnnn on exact head `5394b7e…`; reviewer noted a non-blocking direct-mobile-sort test gap; peer merged as `42ad3bc…`; exact post-merge staging and release-PR CI were green |
| [#37](https://github.com/Peepipat-Suesoongnuen/TokTickIT/pull/37) | `lab2-staging` | Final `lab2-staging -> main` release PR. @thananun-7203 requested documentation/evidence corrections; @Tanaboonnnnn requested reopening Issue #19, then re-reviewed and **APPROVED** exact final head `b9da7c49…`; @Tanaboonnnnn peer-merged PR #37 into `main` as `967d8fed…`; exact final-main CI run `33877953656` completed successfully |

## Review feedback I received and how I handled it

### PR #20 — evidence must match repository state

The reviewer identified documentation that described visual/manual evidence as if it had already happened even though the PR was documentation-only. I changed the wording to planned/deferred evidence, clarified the `Category.isActive` migration/backfill decision, and documented the isolated test-database prerequisite before the PR was approved.

**Lesson applied later:** feature-branch evidence, hosted-CI evidence, and final-`main` evidence are recorded separately; `tests.md` does not mark a row `Pass` before the final main verification.

### PR #22 — contract consistency and traceable test debt

The reviewer called out an inconsistent error envelope, an unnecessarily complex Requester Selection render condition, and missing requester API/UI test evidence. I aligned the error handling, simplified the rendering condition, and kept the missing tests explicitly `Planned` rather than claiming coverage that was not present.

### PR #25 — blocker-driven correction

The Ticket Detail / Attachment PR received several rounds of substantive review. Blocking findings included attachment-count concurrency, validation/storage behavior, upload/removal UI states, modal accessibility, stale-response handling, and evidence synchronization. The changes were handled as contract/test defects rather than cosmetic preferences and were re-reviewed before merge.

### PR #28 — non-blocking minor feedback

@Tanaboonnnnn approved the Create Ticket corrective coverage and left two non-blocking points:

1. `API-07` proved requester binding/persistence at ticket creation but `tests.md` still used the word `immutable`, while Lab 2 has no Ticket update endpoint that can directly exercise immutability. Issue 12 corrects only the test-evidence wording; BR-08 itself is unchanged.
2. A possible UI-04 hardening test could select a valid file and verify it remains after Create Ticket submission failure. This was explicitly non-blocking and is not added unless the final contract/evidence audit requires it.

Because both findings were non-blocking and the reviewed exact head was already green, no extra commit was added to PR #28 solely for those suggestions. The wording cleanup is carried by this documentation/style issue.

### PR #35 — non-blocking release-hardening feedback

@Tanaboonnnnn approved exact head `930e469…` and left two non-blocking points: the defensive My Tickets `ticketDate` fallback could hide a malformed backend response, and hosted evidence did not explicitly assert the desktop/tablet table wrapper itself had no horizontal overflow.

Issue #19 handles both without rewriting the already-approved UI behavior: `listTickets()` now validates required ISO 8601 UTC `ticketDate` values at the client API boundary while retaining `—` only as a last-resort defensive render, and Playwright adds an explicit visible `.table-responsive` `scrollWidth <= clientWidth` assertion at desktop/tablet widths. These are release hardening items, not retroactive blockers on PR #35.

### PR #36 — release-evidence synchronization before staging merge

@Tanaboonnnnn reviewed the Issue #19 integration work and initially submitted `CHANGES_REQUESTED` on head `d11e234…` because the PR description and `tests.md` still contained stale evidence wording. The implementation/test hardening itself had no functional blocker. I synchronized the canonical PR/test evidence to the current head and hosted runs while keeping every `tests.md` `Final` cell `Planned` until final `main` verification.

The reviewer then re-reviewed exact final head `c763999…`, approved it, and the peer merged PR #36 into `lab2-staging` as `e213b00…`. The final reviewed-head push/PR CI and the post-merge staging CI were green.

### PR #39 — focused sort-refresh fix and mobile-test minor

@Tanaboonnnnn verified that the sort-refresh change keeps the existing desktop table and mobile cards mounted while the replacement request is pending, preserves initial/requester-switch loading behavior, and retains stale-response protection. The reviewer approved exact head `5394b7e…` and recorded one **non-blocking** test-hygiene point: the deferred regression test triggers sorting through the desktop control and asserts both desktop and mobile results, rather than directly clicking the mobile sort control in that same case. Desktop and mobile controls use the same `applySort(field)` request/state path, so this was not treated as a product blocker.

The peer merged PR #39 as `42ad3bc…`; exact post-merge staging push CI and the release-PR CI on that same head were green.

### PR #37 — final release review and merge

@thananun-7203 reviewed release head `42ad3bc…` and reported no production-code blocker, but submitted `CHANGES_REQUESTED` for two factual documentation inconsistencies:

1. `ui-spec.md` §9 still described the visual checklist as future Issue-12 work with unchecked boxes even though `tests.md` §4 records the executed evidence.
2. `reviewer.md` had not yet recorded PR #36's completed review/merge history.

The reviewer also noted one non-blocking wording issue: `path.resolve("uploads")` is not inherently cwd-independent; it resolves from the process working directory. The documented server/test commands use `server/` as that working directory.

Those documentation/evidence corrections were applied on release head `7c39b25…`, where exact-head push and PR CI passed client/server/e2e after one unchanged E2E rerun on the push workflow.

@Tanaboonnnnn independently reviewed the release process and identified one additional blocking process/evidence inconsistency: Issue #19 had been closed as Completed before PR #37 was merged to `main`, before an exact final-main merge SHA existed, and before hosted final-main client/server/e2e verification. This contradicted Issue #19's own acceptance criterion that it closes / moves Done only after final-main verification is complete.

Issue #19 was therefore reopened. On exact corrected head `b9da7c49e869b378cb2f2536639aaccf12ae70f4`, @Tanaboonnnnn re-reviewed the release, confirmed the blocker was resolved, and submitted **APPROVED**. The same peer then merged PR #37 into `main` as merge commit `967d8fed8f06a4240a34cb30498f3489a67c3ed0` on 2026-09-04.

Hosted final-main CI run `33877953656` ran on that exact merge SHA and completed **SUCCESS**: server and client jobs passed, and the E2E job passed overall. The final-main server suite reported **101/101** tests and the client suite **67/67**. Playwright reported **6 passed + 1 flaky**: E2E-01 timed out once waiting for the visible Official Ticket Number and then passed on Playwright's retry. This retry is recorded explicitly rather than presented as a clean first-pass 7/7 result.

## Pull Requests I reviewed for peers

GitHub records show Lab 2 reviews submitted from @Peepipat-Suesoongnuen, including:

| Repository / PR | Review contribution |
|---|---|
| [thananun-7203/toktickit #20](https://github.com/thananun-7203/toktickit/pull/20) | Reviewed Lab 2 specification/test-plan work |
| [thananun-7203/toktickit #21](https://github.com/thananun-7203/toktickit/pull/21) | Reviewed Development Requester / database-seed work |
| [thananun-7203/toktickit #22](https://github.com/thananun-7203/toktickit/pull/22) | Reviewed Create Ticket screen work |
| [thananun-7203/toktickit #23](https://github.com/thananun-7203/toktickit/pull/23) | Reviewed ticket-number / hosted-CI follow-up |
| [thananun-7203/toktickit #24](https://github.com/thananun-7203/toktickit/pull/24) | Submitted `CHANGES_REQUESTED` after checking that repo's own Issue/spec/test plan; findings covered post-requester landing, empty-state Create CTA, and missing oldest/newest test evidence |
| [Chxtamos/-TokTickIT- #19](https://github.com/Chxtamos/-TokTickIT-/pull/19) | Reviewed Ticket creation API work |
| [Chxtamos/-TokTickIT- #23](https://github.com/Chxtamos/-TokTickIT-/pull/23) | Reviewed Ticket Detail API work |

The peer-review rule used throughout Lab 2 was: **their contract → their implementation → their tests → their CI**. Findings were not based on differences from this repository's implementation style.

## Final release status

Completed release gates:

- Issue #19 / PR #36 release-integration evidence and hardening was peer-reviewed and merged into `lab2-staging` as `e213b00…`.
- Issue #38 / PR #39 sort-refresh UX hardening was peer-reviewed and merged into `lab2-staging` as `42ad3bc…`.
- The responsive/visual checklist has executed feature/staging evidence recorded in `tests.md` §4 and tracked screenshots.
- Release-review documentation/evidence corrections on `7c39b25…` were verified by hosted push and PR CI.
- Issue #19 was reopened when review found it had been closed before its release gate.
- PR #37 exact final head `b9da7c49…` was approved by @Tanaboonnnnn and peer-merged into `main` as `967d8fed…`.
- Exact final-main CI run `33877953656` on `967d8fed…` completed successfully: server **101/101**, client **67/67**, E2E job success with **6 passed + 1 flaky** (E2E-01 passed on retry).

Final evidence-sync gate:

- This documentation-only follow-up synchronizes `tests.md` and `reviewer.md` with the verified PR #37/final-main evidence; it does not change production or test behavior.
- The evidence follow-up must first be peer-reviewed and merged into `lab2-staging`, followed by exact post-merge staging CI verification.
- Only after staging is green should a separate peer-reviewed release PR promote `lab2-staging -> main`; the resulting exact `main` CI must be green before Issue #19 is finally closed / moved Done.
- The author does not self-merge either the staging evidence PR or the subsequent release PR.
