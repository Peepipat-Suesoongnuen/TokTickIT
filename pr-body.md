เพิ่มฟังก์ชัน My Tickets สำหรับ Lab 2 (Issue 9) — `GET /api/tickets` strict query (BR-20), search case-insensitive บน summary/description (BR-19), filter category/requestedPriority, sort `updatedAt`/`ticketDate`/`requestedPriority` (BR-21) + pagination 10/20/50, และหน้า My Tickets (toolbar search/filter/sort/pageSize, table desktop / card mobile, empty vs no-results แยกกัน BR-22, loading/failure + Retry, numbered pagination + accessible labels, Open disabled defer ไป Issue 10 ตาม `ui-spec.md:5.3`)

Closes #15

## Verification (73bc6bb05bcc393d2dd465aaedbc8669ae85b212)
- Verified at `73bc6bb` → server 33 passed (31 My Tickets + 2 Lab 1), client 20 passed (17 My Tickets + 3 App); `npm run build` / `tsc --noEmit` clean both sides; `git diff --check` clean
- Hosted CI **passed** — https://github.com/Peepipat-Suesoongnuen/TokTickIT/actions/runs/33320049779 and https://github.com/Peepipat-Suesoongnuen/TokTickIT/actions/runs/33320047712 (server 45s / client 17-21s, 4/4 success, `toktickit_test` migrate + seed 4 Categories / 7 Related Systems / 5 Development Requesters)
- `TEST_DATABASE_URL` → integration tests แยกจาก development database; Prisma CLI รับ test URL ผ่าน `DATABASE_URL` ตอน migrate/seed ตาม `schema.prisma`
- `server/.env.example`, `docs/lab-02/tests.md` และ root `README.md` → อัปเดตขั้นตอนสร้าง, migrate, seed และรัน dedicated test database แล้ว

> `docs/lab-02/tests.md:181` ยังคง `Planned` จนกว่า final `main` green run — responsive screenshot / E2E ยัง defer เป็น `Planned` ตามเอกสาร ไม่ได้ claim ว่าผ่านแล้ว
