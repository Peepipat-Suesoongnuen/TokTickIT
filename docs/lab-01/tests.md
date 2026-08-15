# Lab 1 — Test Plan and Evidence

All test files live under server/tests/lab-01/ and client/tests/lab-01/.

| # | Tool | Test | Result |
|---|------|------|--------|
| 1 | Supertest | GET /api/health returns 200, status=ok | Passed |
| 2 | Supertest | GET /api/categories returns 4 seeded categories in id order | Passed |
| 3 | Vitest | Heading renders | Passed |
| 4 | Vitest | Success state shows Online + category list | Passed |
| 5 | Vitest | Error state shows Offline + message | Passed |

## Evidence — API-01 (server): GET /api/health

![API-01 ภาพการรัน test GET /api/health จาก terminal output](screenshots/api-01-health.png)

## Evidence — API-02 (server): GET /api/categories

![API-02 ภาพการรัน test GET /api/categories ได้ 4 หมวดหมู่เรียงตาม id จาก terminal output](screenshots/api-02.png)

## Evidence — UI-01 (client): Heading renders

![UI-01 ภาพการรัน test heading render จาก terminal output](screenshots/ui-01-heading.png)

## Evidence — UI-02/UI-03 (client): Online + Offline states

![UI-02 ภาพการรัน test client ผ่าน 3 tests (heading, success, error) จาก terminal output](screenshots/ui-02.png)

## Evidence — API-02 live: /api/categories ตอบจาก PostgreSQL

![api-db ภาพ API ตอบ JSON 4 หมวดหมู่ที่อ่านจากฐานข้อมูลจริง](screenshots/api-db.png)

## Evidence — Issue 3: Seed 4 categories (idempotent)

![prisma-seed ภาพการรัน seed แสดง Seeded 4 categories](screenshots/prisma-seed.png)

## Evidence — Issue 3: Database มี 4 categories

![Category ตรวจข้อมูล Category ใน PostgreSQL มี 4 แถว](screenshots/Category.png)

## Evidence — Demo: System status จาก localhost

![Demo หน้าเว็บ localhost แสดง System Status](screenshots/image.png)

## Evidence — Demo: รายการหมวดหมู่จาก API

![demo หน้าเว็บแสดง System Status Online + รายการ 4 หมวดหมู่ที่ได้จาก API](screenshots/demo.png)