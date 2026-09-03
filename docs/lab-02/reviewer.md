# Lab 2 — Peer Review Record

**Author:** Peepipat Suesoongnuen — 67070507207 — GitHub: @Peepipat-Suesoongnuen
**Lab workflow:** feature branch → peer-reviewed PR → `lab2-staging`; final release integration is handled separately in Issue 13.

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

## Issue 13 / release review readiness

Before the Issue #19 integration PR is handed to a peer reviewer, the branch must show:

- the remaining planned Unit/API/Requester Selection evidence implemented and traceable;
- Issue #19 ticket-number, `ticketDate`, E2E-01, table-wrapper, and submission-evidence hardening passing locally;
- completed responsive/visual checklist with current tracked screenshots, including invalid-attachment and Requester Selection loading/failure evidence required for final submission;
- current `reviewer.md`, `ai-use.md`, README, specification/API/UI/test documents;
- client/server regression, typecheck/build, E2E, and `git diff --check` evidence;
- hosted CI reported only after it actually runs on the pushed exact head.

After that integration PR is peer-approved and merged to `lab2-staging`, one separate release PR `lab2-staging -> main` is required. The reviewer/peer performs the merge. Final reviewer.md evidence must then add the Issue #19 integration PR and the release PR with reviewer identity, comments/response summary, approval, exact reviewed head, and final merge SHA.
