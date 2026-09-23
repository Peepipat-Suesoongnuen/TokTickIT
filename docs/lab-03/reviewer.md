# Lab 3 Reviewer Record — TokTickIT

Peer review trail for the Lab 3 increment (`lab3-staging`). Every entry below
was read from live GitHub state during release integration (Issue #52); review
states, SHAs, and merge commits are exact repository facts, not recollection.

Review workflow for every Lab 3 PR: feature branch → peer-reviewed PR →
`lab3-staging`. The author never self-merges. `Request Changes` cycles were
resolved with re-verification and exact-head CI before approval in each case.

## Merged Lab 3 pull requests

| PR | Scope (Issue) | Head | Merged | Review rounds | Final approval |
|---|---|---|---|---|---|
| #54 | Sprint 3 Engineering Contract (docs only, #43) | `2ca5098` | 2026-09-15 | 3× Request Changes → fixes → re-review (Tanaboonnnnn) | Tanaboonnnnn |
| #56 | User migration/credentials/seed (#44) | `3146e4a` | 2026-09-17 | Request Changes (Tanaboonnnnn, L0u1sss) → fixes → re-review | Chxtamos |
| #58 | Authentication/session/logout/mandatory change (#45) | `0686e8f` | 2026-09-18 | Request Changes (chaproi, Chxtamos, Tanaboonnnnn, L0u1sss, cottonlnwza) → fixes → re-review, approved by L0u1sss | L0u1sss |
| #59 | Authorization cutover + Requester regression (#46) | `6b38b9a` | 2026-09-19 | 1× Request Changes (Chxtamos, role-guard blocker) → fix → re-review | Tanaboonnnnn |
| #60 | Staff Ticket workspace (#48) | `2f9e8eb` | 2026-09-20 | Approved without changes | Tanaboonnnnn |
| #61 | Comments/notes/resolution (#49) | `640bc68` | 2026-09-21 | Approved without changes | Tanaboonnnnn |
| #62 | Administrator User Management (#50) | `f1bad62` | 2026-09-22 | 2× Request Changes (spec-blocker: out-of-contract admin-list extras) → Path C revert → re-review | Tanaboonnnnn |
| #64 | E2E/security/a11y/visual evidence (#51) | `d2d5c3e` | 2026-09-22 | 1× Request Changes (VISUAL-01 coverage gap) → matrix completed → re-review | Tanaboonnnnn |

Notes:

- PR #55 (`feature/16` → `lab3-staging`) was opened without owner instruction
  and closed unmerged the same day with an explanation; its work re-entered
  review properly as PR #56. It is not part of the merged line.
- PR #62's Request Changes round is the reason the admin-list extras (User ID
  column/search, Status filter, client-side pagination) are NOT in this
  increment: they contradict Lab Sheet 3 §8.5 and the checked-in contract.
  They were reverted out (commit `f1bad62`) and parked in follow-up Issue #63
  behind a contract-amendment prerequisite. No contract document was silently
  rewritten to justify code at any point.
- PR #64's Request Changes round found that VISUAL-01 could pass while
  required responsive evidence was missing (conditional capture + incomplete
  matrix); the spec was extended to deterministic fixtures and the full
  1440/900/375 matrix before approval.

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
