# Lab 2 — AI Use and Reflection

**LLM/agent used:** ChatGPT (GPT-5.6 Sol)
**Verification tools used with the assistant:** local terminal/repository tools, GitHub CLI, Vitest/Supertest/Testing Library, and Playwright. Tool output was treated as evidence; the LLM was not allowed to invent test/CI/review results.

## Selected key prompts and how I used the result

| # | Prompt (summarised from the working conversation) | What I did with the result |
|---|---|---|
| 1 | Plan the remaining Lab 2 work using the five-role sub-agent methodology, without needing to spawn real sub-agents. | Split work into implementation, contract review, test/CI audit, merge gate, and feedback-audit passes; checked GitHub Issue numbers before starting so completed Issue #17 was not reimplemented. |
| 2 | Start Issue 12 from the approved plan. | Verified a clean `lab2-staging` baseline/stashes, created `feature/12-ui-style-docs`, moved Kanban to Started, and began with failing `ui-style.test.tsx` tests before production UI changes. |
| 3 | Check whether the failing PR E2E check mattered and investigate it. | Inspected hosted job logs instead of assuming a code defect; local E2E passed, failed hosted jobs were rerun, and the same code later passed. This prevented an unsupported production-code change for a flaky timeout. |
| 4 | Draft a PR comment for approval before push/opening the corrective Create Ticket PR. | Prepared a traceable comment with scope, test IDs, local evidence, and an explicit statement that hosted CI had not run yet; push/PR happened only after explicit approval. |
| 5 | Review a peer PR using the peer repository's own specification, not ours. | Used the peer repo's Issue/spec/api/ui/tests as the review source, separated blockers from preferences, and submitted `CHANGES_REQUESTED` only for contract-backed findings. |
| 6 | Decide whether PR #28 reviewer minors should block merge and keep `agent.md` local-only. | Classified the API-07 wording as a valid minor and file-preservation coverage as optional hardening; kept `agent.md` in `.git/info/exclude` instead of changing project `.gitignore`. |
| 7 | Continue Issue 12 after the interrupted session. | Re-ran the exact targeted style test rather than assuming the interrupted command passed; continued from filesystem/test evidence. |
| 8 | Implement UI style/accessibility evidence according to `ui-spec.md`. | TDD exposed missing mobile navigation and three real focus/accessibility defects: first-invalid-field focus, removal-modal focus return, and Bootstrap suppressing the required keyboard outline. Added central Zen Green classes, touch-friendly mobile nav, corrected focus behavior, real-browser keyboard evidence, and deterministic visual-state Playwright evidence. |
| 9 | Keep documentation evidence truthful while finishing Issue 12. | Updated `tests.md` without changing `Final` to `Pass`, narrowed API-07 evidence wording, removed stale deferrals already completed by PR #28, and recorded exactly what local feature-branch evidence exists versus what still awaits hosted/final-main verification. |
| 10 | Perform the final Issue #19 audit against the original Lab 2 Labsheet and the local `agent.md` history before allowing commit/push. | Re-read the uploaded 22-page Labsheet, cross-checked branch flow, Test DD/TDD wording, reviewer history, README/setup, screenshots and submission rubric; corrected stale Figure/reviewer evidence, strengthened attachment transaction documentation, and added missing invalid-attachment plus Requester Selection loading/failure screenshot evidence before release handoff. |

## My Reflection

The most useful prompts were the ones that fixed the **source hierarchy, scope boundary, and evidence rule before implementation**. Requiring the assistant to check the Labsheet/Issue/contracts first, distinguish local tests from hosted CI, and ask for approval before remote workflow reduced rework and stopped confident-but-unverified claims.

I also had to correct or reject AI assumptions more than once. A proposed next task referred to GitHub Issue #17 as if it were new work; checking GitHub showed that Issue #17 was already the completed E2E/responsive issue, so the work was not duplicated. During Issue 12, early style/visual test harness attempts also needed path, syntax, and interception corrections; those were treated as test-harness defects and fixed before using the tests as product evidence.

The strongest example of useful AI-assisted TDD was accessibility. The planned UI-style tests did not merely check class names: they exposed that Create Ticket did not actually focus its first invalid control and that the attachment removal dialog could lose the original Remove-button focus reference. A later real-browser keyboard test also proved that Bootstrap's focus rule overrode the initial global outline, so keyboard users still lacked the required visible focus ring. Those findings were tied directly to `ui-spec.md`, fixed minimally, and re-run until both component and Playwright accessibility evidence were green.

The main lesson is that the LLM is most valuable as an analysis and execution assistant when every recommendation must survive contract review and executable evidence. Human review remains necessary for scope decisions, peer approval, visual judgement, and the final merge/release decision.
