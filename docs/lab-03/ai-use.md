# Lab 3 AI Use — TokTickIT

How LLM assistance was used for the Lab 3 increment: specification support
(spec agent) and implementation support (coding agent), with human review at
every approval gate (plan approval, push/PR approval, merge approval —
never self-merged, never auto-pushed).

## Models and tools

- Coding agent: **Muse Spark** (via the OpenCode session), operating under a
  local-only operating manual (`agent_rule/agent.md`, never committed) that
  enforces Labsheet > Contract > Issue/AC precedence, TDD, approval gates,
  and evidence-before-claims.
- Hosted CI (server/client/e2e/migration-proof jobs) as the independent
  verifier of every claim; peer reviewers as the final authority — an AI
  "ready" verdict never substitutes for human approval or green CI.

## Selected key prompts (coding agent)

> Owner note (TO-FILL before submission): replace the placeholders below
> with 6–10 of your own actual prompts from this sprint — the instruction
> you gave, not the agent's reply. The agent cannot reconstruct your
> prompts for you.

1. `[OWNER: paste the prompt that started the Lab 3 engineering-contract work]`
2. `[OWNER: paste the prompt that ordered an Issue implementation]`
3. `[OWNER: paste a prompt where you corrected the agent or stopped it]`
4. `[OWNER: paste the prompt that requested a reviewer-feedback audit]`
5. `[OWNER: paste the prompt behind a UI/mockup fidelity round]`
6. `[OWNER: paste the prompt behind an E2E/evidence round]`
7. `[OWNER: optional — consolidation or scope decision prompt]`
8. `[OWNER: optional — release/submission prompt]`

What the agent verifiably did with such prompts (repository evidence, not
testimony): translated approved plans into TDD implementation on feature
branches; ran unit/API/UI/E2E suites plus typecheck/build locally and
reported exact results; refused to push, open PRs, merge, or move Kanban
items without explicit per-instance approval; audited reviewer comments
against the contract with explicit classifications instead of blindly
applying them; reverted out-of-contract scope (admin-list extras, PR #62
Path C) rather than rewriting the contract to justify code.

## My Reflection (TO-FILL before submission)

> Owner: write 1–2 short paragraphs in your own words, for example:
> what the specification agent clarified for you, where the coding agent
> saved real time vs where it needed correction, and what you would do
> differently (more upfront specification? smaller Issues? stricter review
> of agent-proposed scope?). Delete this placeholder box when done — do not
> submit it as-is.

## Agent-use limits observed

- The agent never invents requirements: ambiguities stop and ask.
- The agent never treats mockups, prior-session memory, or another
  student's work as correctness baselines.
- Test counts, SHAs, and CI states in working notes are treated as stale
  snapshots until refreshed from live repository/GitHub state.
