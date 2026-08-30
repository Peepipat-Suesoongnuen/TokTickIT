เพิ่มฟังก์ชัน My Tickets สำหรับ Lab 2 (Issue 9) — `GET /api/tickets` strict query (BR-20), search case-insensitive บน summary/description (BR-19), filter category/requestedPriority, sort `updatedAt`/`ticketDate`/`requestedPriority` (BR-21) + pagination 10/20/50, และหน้า My Tickets (toolbar search/filter/sort/pageSize, table desktop / card mobile, empty vs no-results แยกกัน BR-22, loading/failure + Retry, numbered pagination + accessible labels, Open disabled defer ไป Issue 10 ตาม `ui-spec.md:5.3`)

Closes #15

## Verification (latest PR head)
- Hosted CI (`push` + `pull_request`) → server 25 passed (23 My Tickets + 2 Lab 1), client 15 passed (12 My Tickets + 3 App)
- Server CI → migrate `toktickit_test`, seed 4 Categories / 7 Related Systems / 5 Development Requesters, then run tests with the same dedicated test database
- `npx tsc --noEmit` → clean ทั้ง 2 ฝั่ง
- `git diff --check` → clean
- `TEST_DATABASE_URL` → integration tests แยกจาก development database; Prisma CLI รับ test URL ผ่าน `DATABASE_URL` ตอน migrate/seed ตาม `schema.prisma`
- `server/.env.example`, `docs/lab-02/tests.md` และ root `README.md` → อัปเดตขั้นตอนสร้าง, migrate, seed และรัน dedicated test database แล้ว

> `docs/lab-02/tests.md:181` ยังคง `Planned` จนกว่า final `main` green run — responsive screenshot / E2E ยัง defer เป็น `Planned` ตามเอกสาร ไม่ได้ claim ว่าผ่านแล้ว
