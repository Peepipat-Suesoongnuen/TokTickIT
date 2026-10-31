# Lab 4 reviewer record

## Scope

This record covers merged PRs #76 and #83–#87 through the Lab 4 final-hardening merge to `lab4-staging`. It records the live GitHub author, source branch, final PR head, merge commit/date, formal review rounds, and author responses visible in the PR conversations. The #82 release PR is not open or merged yet; its actual review and merge facts must be added in the later evidence-sync PR. Review facts below were fetched from GitHub on 2026-10-30.

## Merged PRs

| PR | Author | Source branch → target | Final PR head | Merge commit | Merged (UTC) |
|---|---|---|---|---|---|
| [#76 — Sprint 4 engineering contract](https://github.com/Peepipat-Suesoongnuen/TokTickIT/pull/76) | `Peepipat-Suesoongnuen` | `feature/25-lab4-engineering-contract` → `lab4-staging` | `168f3661efc510f3533db2da11ab635f8774a1fd` | `7881eec1ca701d0a69b566384bb208f2533fa690` | 2026-10-01 14:54:38Z |
| [#83 — Actions Taken foundation](https://github.com/Peepipat-Suesoongnuen/TokTickIT/pull/83) | `Peepipat-Suesoongnuen` | `feature/26-actions-taken-foundation` → `lab4-staging` | `a22b61024af80c0a2e509c3cdb95f0ab2e4fbb73` | `2d51cdc664fbbf11e92a294a7f058f8100724588` | 2026-10-02 20:38:43Z |
| [#84 — Actions Taken UI](https://github.com/Peepipat-Suesoongnuen/TokTickIT/pull/84) | `Peepipat-Suesoongnuen` | `feature/27-actions-taken-ui` → `lab4-staging` | `13794e0405fdc5229e11ac5dc9608933c3f2c452` | `78dd9ce3cb51a88729d31fe59f1c55326bd84f5c` | 2026-10-03 10:04:24Z |
| [#85 — Per-cycle resolution gate](https://github.com/Peepipat-Suesoongnuen/TokTickIT/pull/85) | `Peepipat-Suesoongnuen` | `feature/28-ticket-workflow-gate` → `lab4-staging` | `a64971d65c1f0b17ddf1bf12f7c07d838d2e163c` | `b4d511da4024d986cb9f37475ea62fbb779690b5` | 2026-10-03 14:34:38Z |
| [#86 — Role dashboards](https://github.com/Peepipat-Suesoongnuen/TokTickIT/pull/86) | `Peepipat-Suesoongnuen` | `feature/29-role-dashboards` → `lab4-staging` | `d6d955c27f2fef8b0db88ca97537b0cc5667828d` | `7b3f0264e09c23fd511692f2717deac4a40072a0` | 2026-10-03 19:00:34Z |
| [#87 — Final hardening](https://github.com/Peepipat-Suesoongnuen/TokTickIT/pull/87) | `Peepipat-Suesoongnuen` | `feature/30-final-hardening` → `lab4-staging` | `a4641de3a1ef98adfa5aab5f0fa36b8868a2130f` | `c3f8ab3f1575216611a708b8797ca45799b178d9` | 2026-10-04 17:41:06Z |

## Formal review rounds and responses

The recorded reviewer on all six PRs was `Tanaboonnnnn`. The PR links above open the complete GitHub conversation and review records.

| PR | Review history (UTC, reviewed head) | Author response / resolution |
|---|---|---|
| #76 | `CHANGES_REQUESTED` — 2026-10-01 07:45:08Z @ `50eec5f7c4ddf71f5123c0e557162eeb23d72c6c`; `APPROVED` — 2026-10-01 14:33:36Z @ `7e186717c575a17c205b29228f19c84dcf7b37a0` | Author replied 10:00:45Z and pushed the contract fixes. **Head discrepancy:** commit `168f3661efc510f3533db2da11ab635f8774a1fd` was pushed at 14:47:18Z after the recorded approval; GitHub shows no later formal review submission before the 14:54:38Z merge. The author posted a re-review request at 14:51:36Z. This record does not characterize the approval as covering `168f366`. |
| #83 | `CHANGES_REQUESTED` — 2026-10-02 19:39:17Z @ `7a27972230c1f7e1f7aaa9345b562fae94bc7242`; `APPROVED` — 2026-10-02 20:38:31Z @ `a22b61024af80c0a2e509c3cdb95f0ab2e4fbb73` | Author replied 20:21:43Z; final fix commit `a22b610` was the approved PR head. |
| #84 | `CHANGES_REQUESTED` — 2026-10-03 08:38:38Z @ `73aae584bcad12ea299b089b70f37b0de9578546`; `APPROVED` — 2026-10-03 10:03:13Z @ `13794e0405fdc5229e11ac5dc9608933c3f2c452` | Author replied 09:14:14Z; final UI/responsive/focus commit `13794e0` was the approved PR head. |
| #85 | `CHANGES_REQUESTED` — 2026-10-03 13:33:01Z @ `ca65443e88d9dcc794204380f3aac6686d284710`; `APPROVED` — 2026-10-03 14:33:21Z @ `a64971d65c1f0b17ddf1bf12f7c07d838d2e163c` | Author replied 14:24:37Z; rollback/concurrency test commit `a64971d` was the approved PR head. |
| #86 | `CHANGES_REQUESTED` — 2026-10-03 18:06:01Z @ `49284efa227d3a20d0eed1efc2c9123ff2539a9e`; `APPROVED` — 2026-10-03 18:58:47Z @ `d6d955c27f2fef8b0db88ca97537b0cc5667828d` | Author replied 18:53:56Z; reviewer-fix commit `d6d955c` was the approved PR head. |
| #87 | `CHANGES_REQUESTED` — 2026-10-04 14:26:25Z @ `13e86a4471014debb8f4d4427ad672db8f9aa049`; second `CHANGES_REQUESTED` — 2026-10-04 15:44:28Z @ `36e834a1dd4e96a6d45ca093261823362e329b81`; `APPROVED` — 2026-10-04 17:39:43Z @ `a4641de3a1ef98adfa5aab5f0fa36b8868a2130f` | Author replied 15:21:51Z after round one; the follow-up commits `36e834a` and `a4641de` addressed the later rounds. The final approved head matches the merge PR head. |

## Peer review coverage

`Tanaboonnnnn` is the only reviewer recorded in the formal reviews for PRs #76 and #83–#87. No other peer reviewer was found in those PR review records. The release PR review remains to be recorded after it exists.
