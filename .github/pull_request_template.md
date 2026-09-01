# Verification — required before requesting review
- [ ] `cd server && npx tsc --noEmit` clean
- [ ] `cd client && npx tsc --noEmit` clean
- [ ] `cd server && npm test` — ___ passed
- [ ] `cd client && npm test` — ___ passed
- [ ] `git diff --check` clean
- [ ] `TEST_DATABASE_URL` isolated (`server/src/prisma.ts` lazy) + `server/uploads` git-ignored, targeted `ticketNumber in [...]` cleanup (no `deleteMany({})` / `startsWith`)
- [ ] `FOR UPDATE` + concurrent `Promise.all` test for max 5 (if attachments), `isAllowedSignature` + paired mime/ext, `filename*` header
- [ ] Hosted CI `.github/workflows/ci.yml` — 4/4 pass (links):
  - server: https://github.com/Peepipat-Suesoongnuen/TokTickIT/actions/runs/___
  - client: https://github.com/Peepipat-Suesoongnuen/TokTickIT/actions/runs/___

## Checklist §5.1
Tick all items in `docs/lab-02/tests.md` §5.1 before push.
