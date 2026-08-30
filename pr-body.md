เพิ่มฟังก์ชัน My Tickets สำหรับ Lab 2 (Issue 9) — `GET /api/tickets` strict query (BR-20), search case-insensitive บน summary/description (BR-19), filter category/requestedPriority, sort `updatedAt`/`ticketDate`/`requestedPriority` (BR-21) + pagination 10/20/50, และหน้า My Tickets (toolbar search/filter/sort/pageSize, table desktop / card mobile, empty vs no-results แยกกัน BR-22, loading/failure + Retry, numbered pagination + accessible labels, Open disabled defer ไป Issue 10 ตาม `ui-spec.md:5.3`)

Closes #15

## Verification (feature-branch, `f6f5587` → next SHA)
- `cd server && npm test` → 25 passed (23 my-tickets + 2 lab-01, isolated fixture `ticketNumber in [...]`, no `deleteMany({})`)
- `cd client && npm test` → 15 passed (12 MyTickets + 3 App, UI-07/UI-08/UI-09/UI-23 + a11y/pagination evidence)
- `npx tsc --noEmit` → clean ทั้ง 2 ฝั่ง
- `git diff --check` → clean (fixed trailing whitespace 167,216 + final newline)
- `TEST_DATABASE_URL` → `server/.env.example` + `server/src/prisma.ts` รองรับ dedicated test DB แยกจาก `DATABASE_URL` (fallback targeted cleanup) — ไม่ลบ dev data บน fresh clone
- Hosted CI → `.github/workflows/ci.yml` (server: Postgres service + `TEST_DATABASE_URL` migrate + `tsc` + `npm test` / client: `tsc` + `npm test`) จะเขียวบน push ถัดไป (final `main` green จะเปลี่ยน `tests.md` `Planned` → `Pass` ตามกฎ `tests.md:5`)

> `docs/lab-02/tests.md:181` ยังคง `Planned` จนกว่า final `main` green run — responsive screenshot / E2E ยัง defer เป็น `Planned` ตามเอกสาร ไม่ได้ claim ว่าผ่านแล้ว
